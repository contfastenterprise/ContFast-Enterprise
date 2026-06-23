import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { HRRepository } from '@/repositories/hrRepository';
import { z } from 'zod';

// Dominican Cédula validation function
export function validateCedula(cedula: string): boolean {
  const cleaned = cedula.replace(/-/g, '').trim();
  if (cleaned.length !== 11) return false;
  if (!/^\d+$/.test(cleaned)) return false;

  const weight = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let val = parseInt(cleaned.charAt(i), 10) * weight[i];
    if (val >= 10) {
      val = Math.floor(val / 10) + (val % 10);
    }
    sum += val;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(cleaned.charAt(10), 10);
}

const employeeSchema = z.object({
  employeeCode: z.string().min(1, 'El código de empleado es obligatorio'),
  firstName: z.string().min(1, 'El nombre es obligatorio'),
  lastName: z.string().min(1, 'El apellido es obligatorio'),
  cedula: z.string().refine(val => validateCedula(val), {
    message: 'La cédula dominicana no es válida (ej. 001-0000000-0 o 11 dígitos)',
  }),
  birthDate: z.string().min(1, 'La fecha de nacimiento es obligatoria'),
  email: z.string().email('Correo electrónico no válido').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  photoUrl: z.string().optional().or(z.literal('')),
  gender: z.enum(['masculino', 'femenino']).optional(),
  civilStatus: z.enum(['soltero', 'casado', 'divorciado', 'viudo', 'union_libre']).optional(),
  nationality: z.string().optional().or(z.literal('')),
  departmentId: z.string().uuid('Departamento no válido').optional().nullable(),
  positionId: z.string().uuid('Puesto no válido').optional().nullable(),
  contractType: z.enum(['fijo', 'indefinido', 'temporal', 'por_obra']),
  salary: z.number().positive('El salario debe ser mayor a cero'),
  hireDate: z.string().min(1, 'La fecha de ingreso es obligatoria'),
  terminationDate: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive', 'suspended', 'cancelled']).default('active'),
});

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = await HRRepository.findEmployees(session.companyId, search, limit, offset);

    return NextResponse.json({
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        limit,
        offset,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const body = await req.json();
    const parsed = employeeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    // Clean cedula format to store raw numbers (or keep standard formatted string)
    const cleanCedula = parsed.data.cedula.replace(/-/g, '');

    const emp = await HRRepository.createEmployee(session.companyId, {
      ...parsed.data,
      cedula: cleanCedula,
    });

    await HRRepository.logAudit(session.companyId, session.userId, 'create_employee', 'employees', emp.id, null, emp);

    return NextResponse.json({ success: true, data: emp }, { status: 201 });
  } catch (error: any) {
    const isDup = error.message.includes('unique') || error.message.includes('ya existe') || error.message.includes('key');
    return NextResponse.json({
      success: false,
      error: { message: isDup ? 'El código de empleado o la cédula ya se encuentra registrado.' : error.message }
    }, { status: isDup ? 409 : 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: { message: 'ID es obligatorio' } }, { status: 400 });
    }

    const body = await req.json();
    const parsed = employeeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const oldEmp = await HRRepository.findEmployeeById(id, session.companyId);
    if (!oldEmp) {
      return NextResponse.json({ success: false, error: { message: 'Empleado no encontrado' } }, { status: 404 });
    }

    const cleanCedula = parsed.data.cedula.replace(/-/g, '');

    const emp = await HRRepository.updateEmployee(id, session.companyId, {
      ...parsed.data,
      cedula: cleanCedula,
    });

    await HRRepository.logAudit(session.companyId, session.userId, 'update_employee', 'employees', id, oldEmp, emp);

    return NextResponse.json({ success: true, data: emp });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: { message: 'ID es obligatorio' } }, { status: 400 });
    }

    const oldEmp = await HRRepository.findEmployeeById(id, session.companyId);
    if (!oldEmp) {
      return NextResponse.json({ success: false, error: { message: 'Empleado no encontrado' } }, { status: 404 });
    }

    const emp = await HRRepository.deleteEmployee(id, session.companyId);

    await HRRepository.logAudit(session.companyId, session.userId, 'delete_employee', 'employees', id, oldEmp, null);

    return NextResponse.json({ success: true, data: emp });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}
