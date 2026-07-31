import { ToolRegistry } from "@contfast/ai-core/src/tools/ToolRegistry";
import { CheckStockTool } from "./tools/CheckStockTool";
import { GetSalesSummaryTool } from "./tools/GetSalesSummaryTool";
import { GetPurchasesSummaryTool } from "./tools/GetPurchasesSummaryTool";
import { GetInventorySummaryTool } from "./tools/GetInventorySummaryTool";
import { GetCustomerSummaryTool } from "./tools/GetCustomerSummaryTool";
import { GetCustomerCatalogTool } from "./tools/GetCustomerCatalogTool";
import { GetAccountingSummaryTool } from "./tools/GetAccountingSummaryTool";
import { GetBankBalancesTool } from "./tools/GetBankBalancesTool";
import { GetCashSummaryTool } from "./tools/GetCashSummaryTool";
import { GetHRSummaryTool } from "./tools/GetHRSummaryTool";
import { GetSupplierCatalogTool } from "./tools/GetSupplierCatalogTool";
import { GetSupplierSummaryTool } from "./tools/GetSupplierSummaryTool";
import { GetProductInfoTool } from "./tools/GetProductInfoTool";

/**
 * Función centralizada que construye y devuelve el registro de herramientas reales del ERP.
 * Este registro será inyectado en el AIKernel al momento de instanciarlo.
 */
export function buildERPToolRegistry() {
  const registry = new ToolRegistry();
  
  // Registrar todas las herramientas reales aquí
  registry.register(new CheckStockTool());
  registry.register(new GetSalesSummaryTool());
  registry.register(new GetPurchasesSummaryTool());
  registry.register(new GetInventorySummaryTool());
  registry.register(new GetCustomerSummaryTool());
  registry.register(new GetCustomerCatalogTool());
  registry.register(new GetAccountingSummaryTool());
  registry.register(new GetBankBalancesTool());
  registry.register(new GetCashSummaryTool());
  registry.register(new GetHRSummaryTool());
  registry.register(new GetSupplierCatalogTool());
  registry.register(new GetSupplierSummaryTool());
  registry.register(new GetProductInfoTool());

  return registry;
}


