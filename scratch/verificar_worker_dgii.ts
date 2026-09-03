/**
 * P0-06 + P1-08: el worker de reintento a la DGII.
 *
 * P0-06 -- LO QUE PASO
 * ---------------------
 * `invoiceSubmissionService.submitToDgii` (camino sincrono de emision) ya
 * distinguia, via `leerDesenlace`, entre un rechazo REAL de la DGII y un
 * desenlace DESCONOCIDO (timeout, corte de red, HTTP no-2xx sin marca de
 * rechazo) -- y en el segundo caso dejaba la factura en `submitted` para que
 * `sincronizarPendientes` la resolviera despues, SIN reenviar nunca (para no
 * duplicar el e-CF). `infrastructure/jobRunners.ts` (`processDgiiSubmissionJob`,
 * el que procesa "Enviar"/"Reenviar" y el envio diferido) no usaba
 * `leerDesenlace` -- trataba CUALQUIER fallo de `client.sendDocument` como
 * rechazo definitivo. Consecuencia real: un timeout dejaba la factura en
 * `rejected`, y `POST /api/v1/ecf/[id]/resubmit` permite reenviar cualquier
 * factura `rejected` -- un usuario que ve "rechazada" pulsa "reenviar" y el
 * sistema presenta el MISMO NCF por segunda vez a la DGII.
 *
 * P1-08 -- LO QUE PASO
 * ---------------------
 * `invoiceDbBooker.ts`, `submit/route.ts` y `resubmit/route.ts` encolan el
 * job pasando `submissionId` para que el worker actualice SOLO ese intento.
 * `infrastructure/worker.ts` destructuraba unicamente `{companyId, invoiceId}`
 * de `job.data`, descartando `submissionId` -- asi que
 * `processDgiiSubmissionJob` siempre caia a `envioEnCurso()` (el intento
 * pending/processing mas reciente) en vez de actualizar el intento que ESE
 * job representa. Con dos intentos en vuelo para la misma factura, el worker
 * podia actualizar el equivocado.
 *
 * Este banco comprueba el codigo fuente (sin ejecutar nada contra la DGII
 * real). Contraprobado: revirtiendo el `else` de jobRunners.ts a marcar
 * 'rejected' sin usar leerDesenlace, o revirtiendo worker.ts a no pasar
 * submissionId, las comprobaciones correspondientes se ponen rojas.
 */
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

console.log('\n1) jobRunners.ts usa leerDesenlace en la rama de fallo\n');

const jobRunners = fuente('src/infrastructure/jobRunners.ts');
ok("importa leerDesenlace y mensajeDesconocido de desenlaceEnvio",
  /import \{\s*leerDesenlace,\s*mensajeDesconocido\s*\} from '@\/services\/dgii\/desenlaceEnvio'/.test(jobRunners));

const elseIdx = jobRunners.indexOf('} else {');
const finFuncionIdx = jobRunners.indexOf('sendEmailJob', elseIdx);
const ramaFallo = jobRunners.slice(elseIdx, finFuncionIdx);

ok("llama a leerDesenlace(result.message, result.rawResponse) antes de decidir",
  /const lectura = leerDesenlace\(result\.message, result\.rawResponse\)/.test(ramaFallo));
ok("solo marca 'rejected'/'failed' DENTRO del if (lectura.desenlace === 'rechazo')",
  /if \(lectura\.desenlace === 'rechazo'\) \{[\s\S]*?status: 'failed'[\s\S]*?status: 'rejected'[\s\S]*?throw new Error/.test(ramaFallo));
ok("el caso desconocido deja la factura en 'submitted', no 'rejected'",
  /status: 'submitted'/.test(ramaFallo.slice(ramaFallo.indexOf("desenlace === 'rechazo'")))
);
ok("el caso desconocido NO relanza el job (sin throw fuera del if de rechazo)",
  (() => {
    const trasElIf = ramaFallo.slice(ramaFallo.indexOf("throw new Error(`mSeller rejected"));
    const finDelIfRechazo = trasElIf.indexOf('}') + 1;
    const dpsDelIfRechazo = trasElIf.slice(finDelIfRechazo);
    return !/throw new Error/.test(dpsDelIfRechazo);
  })()
);
ok("usa mensajeDesconocido() para el mensaje que se guarda cuando no consta el desenlace",
  /mensajeDesconocido\(result\.message/.test(ramaFallo));

console.log('\n2) worker.ts reenvia submissionId al processor\n');

const worker = fuente('src/infrastructure/worker.ts');
ok("destructura submissionId de job.data",
  /const \{ companyId, invoiceId, submissionId \} = job\.data/.test(worker));
ok("se lo pasa a processDgiiSubmissionJob",
  /processDgiiSubmissionJob\(\{[\s\S]{0,150}submissionId,/.test(worker));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
