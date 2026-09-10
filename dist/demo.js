"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const proveedor_1 = require("./src/tools/proveedor");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function runDemo() {
    console.log("=================================================");
    console.log("  INICIANDO DEMOSTRACIÓN DE HERRAMIENTAS RETO 01  ");
    console.log("=================================================\n");
    const projectRoot = process.cwd();
    const casosDir = path.join(projectRoot, "reto-01", "casos");
    if (!fs.existsSync(casosDir)) {
        console.error(`Directorio de casos no encontrado: ${casosDir}`);
        process.exit(1);
    }
    const casos = fs
        .readdirSync(casosDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);
    console.log(`Casos detectados: ${casos.join(", ")}\n`);
    for (const caso of casos) {
        console.log(`-------------------------------------------------`);
        console.log(`PROCESANDO CASO: ${caso}`);
        console.log(`-------------------------------------------------`);
        // 1. leer_solicitud
        console.log(`\n1. Ejecutando 'leer_solicitud'...`);
        const resLeerStr = await proveedor_1.leer_solicitud.execute({ caso }, { directory: projectRoot });
        const resLeer = JSON.parse(resLeerStr);
        if (!resLeer.ok) {
            console.error(`  Error en leer_solicitud: ${resLeer.error}`);
            continue;
        }
        console.log(`  [OK] Cliente: ${resLeer.data.cliente} | País: ${resLeer.data.pais} | Formato: ${resLeer.data.formato}`);
        console.log(`  Campos solicitados: ${resLeer.data.campos.length} | Soportes exigidos: ${resLeer.data.soportes.join(", ")}`);
        // 2. mapear_campos
        console.log(`\n2. Ejecutando 'mapear_campos'...`);
        const resMapeoStr = await proveedor_1.mapear_campos.execute({ caso, campos: resLeer.data.campos }, { directory: projectRoot });
        const resMapeo = JSON.parse(resMapeoStr);
        if (!resMapeo.ok) {
            console.error(`  Error en mapear_campos: ${resMapeo.error}`);
            continue;
        }
        console.log(`  [OK] Llenos: ${resMapeo.data.llenos.length} | Faltantes: ${resMapeo.data.faltantes.length} | Requiere confirmación: ${resMapeo.data.requiere_confirmacion.length}`);
        if (resMapeo.data.requiere_confirmacion.length > 0) {
            for (const rc of resMapeo.data.requiere_confirmacion) {
                console.log(`    ⚠️ ${rc.etiqueta}: ${rc.motivo}`);
            }
        }
        // 3. generar_formulario
        console.log(`\n3. Ejecutando 'generar_formulario'...`);
        const resGenStr = await proveedor_1.generar_formulario.execute({ caso, mapeo: resMapeo.data }, { directory: projectRoot });
        const resGen = JSON.parse(resGenStr);
        if (!resGen.ok) {
            console.error(`  Error en generar_formulario: ${resGen.error}`);
            continue;
        }
        console.log(`  [OK] Formulario generado en: ${resGen.data.ruta}`);
        // 4. armar_paquete
        console.log(`\n4. Ejecutando 'armar_paquete'...`);
        const resPaqStr = await proveedor_1.armar_paquete.execute({ caso }, { directory: projectRoot });
        const resPaq = JSON.parse(resPaqStr);
        if (!resPaq.ok) {
            console.error(`  Error en armar_paquete: ${resPaq.error}`);
            continue;
        }
        console.log(`  [OK] Paquete armado en: ${resPaq.data.ruta}`);
        console.log(`  Listo para firma: ${resPaq.data.listo_para_firma ? "SÍ ✅" : "NO ❌"}`);
        console.log(`  Soportes - Presentes: ${resPaq.data.checklist.presentes.length} | Vencidos: ${resPaq.data.checklist.vencidos.length} | Ausentes: ${resPaq.data.checklist.ausentes.length}`);
        // 5. simular_envio
        console.log(`\n5. Ejecutando 'simular_envio' (con confirmado = true)...`);
        const resEnvioStr = await proveedor_1.simular_envio.execute({ caso, confirmado: true }, { directory: projectRoot });
        const resEnvio = JSON.parse(resEnvioStr);
        if (!resEnvio.ok) {
            console.error(`  Error en simular_envio: ${resEnvio.error}`);
            continue;
        }
        console.log(`  [OK] Envío simulado en: ${resEnvio.data.ruta}\n`);
    }
    console.log("=================================================");
    console.log("     DEMOSTRACIÓN FINALIZADA CON ÉXITO           ");
    console.log("=================================================");
}
runDemo().catch((err) => {
    console.error("Error fatal en la ejecución de la demo:", err);
    process.exit(1);
});
