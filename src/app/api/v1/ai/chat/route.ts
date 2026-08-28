import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { db, users, roles } from '@/db';
import { eq } from 'drizzle-orm';
import { RbacService } from '@/services/auth/rbacService';

// AI Core Imports
import { AIKernel } from '@contfast/ai-core/src/kernel/AIKernel';
import { GroqProvider } from '@contfast/ai-core/src/providers/GroqProvider';
import { DefaultIntentRouter } from '@contfast/ai-core/src/routers/DefaultIntentRouter';
import { DefaultPlanner } from '@contfast/ai-core/src/planners/DefaultPlanner';
import { DefaultExecutionEngine } from '@contfast/ai-core/src/engines/DefaultExecutionEngine';
import { DefaultAgentDispatcher } from '@contfast/ai-core/src/dispatchers/DefaultAgentDispatcher';
import { AgentRegistry } from '@contfast/ai-core/src/agents/AgentRegistry';
import { DefaultToolExecutor } from '@contfast/ai-core/src/tools/DefaultToolExecutor';
import type { AgentContext } from '@contfast/ai-core/src/contracts/AgentContext';

// Manifests
import { CTOAgentManifest } from '@contfast/ai-core/src/agents/manifests/CTOAgentManifest';
import { ERPDomainExpertAgentManifest } from '@contfast/ai-core/src/agents/manifests/ERPDomainExpertAgentManifest';
import { SecurityEngineerAgentManifest } from '@contfast/ai-core/src/agents/manifests/SecurityEngineerAgentManifest';

// ERP Native Tools
import { buildERPToolRegistry } from '@/ai/ERPAgentRegistry';

/**
 * Caché para la instancia del Kernel.
 * En un servidor serverless (como Vercel), es útil reutilizar estas instancias 
 * (que no tienen estado local) entre peticiones calientes.
 */
let cachedKernel: AIKernel | null = null;

function getAIKernel(): AIKernel {
  if (cachedKernel) return cachedKernel;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('La variable de entorno GROQ_API_KEY no está configurada en el servidor.');
  }

  // 1. Instanciar Provider
  const provider = new GroqProvider({ apiKey, defaultModel: 'llama-3.1-8b-instant' });

  // 2. Instanciar Registros
  const agentRegistry = new AgentRegistry();
  agentRegistry.register(CTOAgentManifest);
  agentRegistry.register(ERPDomainExpertAgentManifest);
  agentRegistry.register(SecurityEngineerAgentManifest);

  const toolRegistry = buildERPToolRegistry();

  // 3. Instanciar Motores
  const intentRouter = new DefaultIntentRouter(provider);
  const toolExecutor = new DefaultToolExecutor(toolRegistry);
  const planner = new DefaultPlanner(provider, toolExecutor);
  const dispatcher = new DefaultAgentDispatcher(provider, agentRegistry, toolExecutor);
  const executionEngine = new DefaultExecutionEngine(dispatcher);

  // 4. Construir Kernel
  cachedKernel = new AIKernel({
    provider,
    intentRouter,
    planner,
    executionEngine,
    agentDispatcher: dispatcher,
    toolExecutor
  });

  return cachedKernel;
}

export async function POST(req: NextRequest) {
  const resHeaders = new Headers();
  
  // 1. SEGURIDAD: Verificar Auth de manera Zero-Trust
  const auth = await verifyAuth(req, resHeaders);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'No tienes una sesión activa o tu token expiró.' },
      { status: 401, headers: resHeaders }
    );
  }

  try {
    const body = await req.json();
    const { input, history } = body;

    if (!input || typeof input !== 'string') {
      return NextResponse.json(
        { success: false, error: 'El parámetro "input" es requerido y debe ser un texto.' },
        { status: 400, headers: resHeaders }
      );
    }

    // 2. CONSTRUIR CONTEXTO: Buscar permisos exactos en DB
    const [user] = await db
      .select({
        id: users.id,
        role: roles.name,
        roleId: users.roleId,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado en la base de datos.' },
        { status: 404, headers: resHeaders }
      );
    }

    if (user.role !== 'administracion' && user.role !== 'sistemas') {
      return NextResponse.json(
        { success: false, error: 'Acceso denegado. Solo el Administrador y personal de Sistemas pueden usar el Agente de Inteligencia Artificial.' },
        { status: 403, headers: resHeaders }
      );
    }

    const permissions = await RbacService.getUserPermissions(user.id, user.role, user.roleId, auth.companyId);

    // Failsafe: Asegurar que los administradores tengan acceso a los reportes de IA
    // aunque la tabla de permisos en DB esté incompleta.
    if (user.role === 'sistemas' || user.role === 'administracion') {
      const aiPerms = [
        "inventory:read", 
        "sales:read", 
        "expenses:read", 
        "accounting:read", 
        "bank:read", 
        "cash:read", 
        "hr:read"
      ];
      aiPerms.forEach(p => {
        if (!permissions.includes(p)) permissions.push(p);
      });
    }

    // Contexto Inmodificable y Blindado
    const context: AgentContext = {
      tenantId: auth.companyId,
      userId: user.id,
      modo: auth.modo,
      language: 'es', // Opcionalmente extraer del header Accept-Language
      timezone: 'UTC', // Opcionalmente extraer del frontend
      permissions,
      enabledModules: [], // Podría extraerse de la config de la compañía
      input,
      history
    };

    // 3. EJECUCIÓN DEL KERNEL
    const kernel = getAIKernel();
    const result = await kernel.handleRequest(context);

    // 4. RETORNAR RESPUESTA AL CLIENTE
    return NextResponse.json(
      { 
        success: result.success, 
        content: result.content,
        confidence: result.confidence,
        error: result.error
      },
      { headers: resHeaders }
    );

  } catch (error: any) {
    console.error('[AI Core Route Error]:', error);
    return NextResponse.json(
      { success: false, error: 'Hubo un inconveniente conectando con el asistente en este momento. Por favor, inténtalo de nuevo más tarde.' },
      { status: 500, headers: resHeaders }
    );
  }
}
