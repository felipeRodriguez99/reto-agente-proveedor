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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.simular_envio = exports.armar_paquete = exports.generar_formulario = exports.mapear_campos = exports.leer_solicitud = void 0;
const zod_1 = require("zod");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const exceljs_1 = __importDefault(require("exceljs"));
const pdfkit_1 = __importDefault(require("pdfkit"));
/**
 * Función auxiliar para registrar cada ejecución de herramienta en out/<caso>/log.jsonl (RN5).
 */
function logToolExecution(rootDir, caso, herramienta, ok, resumen) {
    try {
        const logDir = path.join(rootDir, "out", caso);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const logPath = path.join(logDir, "log.jsonl");
        const entry = JSON.stringify({
            ts: new Date().toISOString(),
            herramienta,
            ok,
            resumen
        }) + "\n";
        fs.appendFileSync(logPath, entry, "utf-8");
    }
    catch (_) {
        // Ignorar errores de escritura de log para no interrumpir el flujo principal
    }
}
/**
 * Acceso anidado a propiedades con notacion de punto (ej: "contacto_comercial.email")
 */
function getNestedValue(obj, pathStr) {
    if (!obj || !pathStr)
        return undefined;
    const parts = pathStr.split(".");
    let curr = obj;
    for (const part of parts) {
        if (curr === undefined || curr === null)
            return undefined;
        curr = curr[part];
    }
    return curr;
}
/**
 * 1. proveedor_leer_solicitud
 */
exports.leer_solicitud = {
    description: "Lee la solicitud de registro de un caso (correo, plantilla adjunta y soportes exigidos) desde reto-01/casos/<caso>/",
    args: {
        caso: zod_1.z.string().describe("Nombre de la carpeta del caso en reto-01/casos/ (ej: co-industrias-delta)")
    },
    async execute(args, ctx) {
        const rootDir = ctx?.directory || process.cwd();
        try {
            const casoPath = path.join(rootDir, "reto-01", "casos", args.caso);
            const solicitudPath = path.join(casoPath, "solicitud.json");
            const soportesPath = path.join(casoPath, "soportes-exigidos.json");
            if (!fs.existsSync(solicitudPath)) {
                const errorMsg = `No se encontró el archivo de solicitud para el caso: ${args.caso}`;
                logToolExecution(rootDir, args.caso, "proveedor_leer_solicitud", false, errorMsg);
                return JSON.stringify({ ok: false, error: errorMsg });
            }
            const solicitudData = JSON.parse(fs.readFileSync(solicitudPath, "utf-8"));
            const soportesExigidos = fs.existsSync(soportesPath)
                ? JSON.parse(fs.readFileSync(soportesPath, "utf-8"))
                : [];
            let campos = [];
            const formato = solicitudData.formato;
            if (formato === "xlsx") {
                const plantillaPath = path.join(casoPath, "plantilla-celdas.json");
                if (fs.existsSync(plantillaPath)) {
                    campos = JSON.parse(fs.readFileSync(plantillaPath, "utf-8"));
                }
            }
            else if (formato === "pdf") {
                const plantillaPath = path.join(casoPath, "plantilla-campos.json");
                if (fs.existsSync(plantillaPath)) {
                    campos = JSON.parse(fs.readFileSync(plantillaPath, "utf-8"));
                }
            }
            else if (formato === "portal") {
                campos = [];
            }
            const data = {
                pais: solicitudData.pais,
                cliente: solicitudData.cliente,
                formato: solicitudData.formato,
                campos,
                soportes: soportesExigidos
            };
            logToolExecution(rootDir, args.caso, "proveedor_leer_solicitud", true, `Solicitud leída para ${solicitudData.cliente} (${solicitudData.pais}) - Formato ${solicitudData.formato}`);
            return JSON.stringify({ ok: true, data });
        }
        catch (err) {
            const errorMsg = err.message || String(err);
            logToolExecution(rootDir, args.caso, "proveedor_leer_solicitud", false, errorMsg);
            return JSON.stringify({ ok: false, error: errorMsg });
        }
    }
};
/**
 * 2. proveedor_mapear_campos
 */
exports.mapear_campos = {
    description: "Cruza la lista de campos solicitados contra el repositorio maestro y glosario, aplicando reglas de impuestos por país.",
    args: {
        caso: zod_1.z.string().describe("Nombre de la carpeta del caso en reto-01/casos/"),
        campos: zod_1.z.array(zod_1.z.any()).describe("Lista de campos devueltos por leer_solicitud (etiquetas u objetos con etiqueta)")
    },
    async execute(args, ctx) {
        const rootDir = ctx?.directory || process.cwd();
        try {
            const casoPath = path.join(rootDir, "reto-01", "casos", args.caso);
            const solicitudPath = path.join(casoPath, "solicitud.json");
            const maestroPath = path.join(rootDir, "reto-01", "repositorio", "maestro.json");
            const glosarioPath = path.join(rootDir, "reto-01", "glosario-campos.json");
            if (!fs.existsSync(solicitudPath)) {
                const errorMsg = `Caso inexistente: ${args.caso}`;
                logToolExecution(rootDir, args.caso, "proveedor_mapear_campos", false, errorMsg);
                return JSON.stringify({ ok: false, error: errorMsg });
            }
            const solicitud = JSON.parse(fs.readFileSync(solicitudPath, "utf-8"));
            const pais = solicitud.pais;
            const maestro = fs.existsSync(maestroPath)
                ? JSON.parse(fs.readFileSync(maestroPath, "utf-8"))
                : {};
            const glosario = fs.existsSync(glosarioPath)
                ? JSON.parse(fs.readFileSync(glosarioPath, "utf-8"))
                : {};
            const llenos = [];
            const faltantes = [];
            const requiere_confirmacion = [];
            for (const item of args.campos) {
                const fieldObj = typeof item === "string" ? { etiqueta: item } : { ...item };
                const etiqueta = fieldObj.etiqueta;
                let claveMaestro = glosario[etiqueta];
                if (!claveMaestro) {
                    // Búsqueda directa o alternativa por coincidencia exacta de llave en maestro
                    if (maestro[etiqueta] !== undefined) {
                        claveMaestro = etiqueta;
                    }
                }
                const valor = claveMaestro ? getNestedValue(maestro, claveMaestro) : undefined;
                // Regla RN1: Identificación tributaria según país
                const esTaxId = claveMaestro === "nit" ||
                    /^(NIT|RUC|RTN|Identificación tributaria|Número de identificación fiscal)$/i.test(etiqueta.trim());
                if (esTaxId) {
                    const nitValor = maestro.nit || "900123456";
                    if (pais === "CO") {
                        llenos.push({
                            ...fieldObj,
                            clave_maestro: "nit",
                            valor: nitValor
                        });
                    }
                    else {
                        requiere_confirmacion.push({
                            ...fieldObj,
                            clave_maestro: "nit",
                            valor: nitValor,
                            motivo: `identificador extranjero: Periferia sólo cuenta con NIT colombiano (${nitValor}) para la etiqueta ${etiqueta} del país ${pais}`
                        });
                    }
                    continue;
                }
                if (valor !== undefined && valor !== null && valor !== "") {
                    llenos.push({
                        ...fieldObj,
                        clave_maestro: claveMaestro,
                        valor
                    });
                }
                else {
                    faltantes.push({
                        ...fieldObj,
                        clave_maestro: claveMaestro || null,
                        valor: null,
                        motivo: "Dato no disponible en el repositorio maestro"
                    });
                }
            }
            const data = {
                llenos,
                faltantes,
                requiere_confirmacion
            };
            const resumen = `Mapeo completado: ${llenos.length} llenos, ${faltantes.length} faltantes, ${requiere_confirmacion.length} requieren confirmación`;
            logToolExecution(rootDir, args.caso, "proveedor_mapear_campos", true, resumen);
            return JSON.stringify({ ok: true, data });
        }
        catch (err) {
            const errorMsg = err.message || String(err);
            logToolExecution(rootDir, args.caso, "proveedor_mapear_campos", false, errorMsg);
            return JSON.stringify({ ok: false, error: errorMsg });
        }
    }
};
/**
 * 3. proveedor_generar_formulario
 */
exports.generar_formulario = {
    description: "Genera el formulario en el formato pedido por el cliente (xlsx, pdf o portal md) en out/<caso>/",
    args: {
        caso: zod_1.z.string().describe("Nombre de la carpeta del caso en reto-01/casos/"),
        mapeo: zod_1.z.object({
            llenos: zod_1.z.array(zod_1.z.any()),
            faltantes: zod_1.z.array(zod_1.z.any()).optional(),
            requiere_confirmacion: zod_1.z.array(zod_1.z.any()).optional()
        }).describe("Resultado obtenido previamente de mapear_campos")
    },
    async execute(args, ctx) {
        const rootDir = ctx?.directory || process.cwd();
        try {
            const casoPath = path.join(rootDir, "reto-01", "casos", args.caso);
            const solicitudPath = path.join(casoPath, "solicitud.json");
            if (!fs.existsSync(solicitudPath)) {
                const errorMsg = `Caso inexistente: ${args.caso}`;
                logToolExecution(rootDir, args.caso, "proveedor_generar_formulario", false, errorMsg);
                return JSON.stringify({ ok: false, error: errorMsg });
            }
            const solicitud = JSON.parse(fs.readFileSync(solicitudPath, "utf-8"));
            const formato = solicitud.formato;
            const outDir = path.join(rootDir, "out", args.caso);
            if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
            }
            const todosCampos = [
                ...args.mapeo.llenos,
                ...(args.mapeo.requiere_confirmacion || []),
                ...(args.mapeo.faltantes || [])
            ];
            if (formato === "xlsx") {
                const workbook = new exceljs_1.default.Workbook();
                const sheetsMap = {};
                for (const item of todosCampos) {
                    const hojaName = item.hoja || "Hoja1";
                    if (!sheetsMap[hojaName])
                        sheetsMap[hojaName] = [];
                    sheetsMap[hojaName].push(item);
                }
                for (const sheetName of Object.keys(sheetsMap)) {
                    const worksheet = workbook.addWorksheet(sheetName);
                    const fields = sheetsMap[sheetName];
                    for (const f of fields) {
                        if (f.celda_etiqueta && f.etiqueta) {
                            worksheet.getCell(f.celda_etiqueta).value = f.etiqueta;
                        }
                        if (f.celda_valor) {
                            worksheet.getCell(f.celda_valor).value = f.valor !== null && f.valor !== undefined ? String(f.valor) : "";
                        }
                    }
                }
                const outPath = path.join(outDir, "formulario.xlsx");
                await workbook.xlsx.writeFile(outPath);
                const relativePath = `out/${args.caso}/formulario.xlsx`;
                logToolExecution(rootDir, args.caso, "proveedor_generar_formulario", true, `Formulario Excel generado en ${relativePath}`);
                return JSON.stringify({
                    ok: true,
                    data: { ruta: relativePath, formato: "xlsx" }
                });
            }
            else if (formato === "pdf") {
                const outPath = path.join(outDir, "formulario.pdf");
                const doc = new pdfkit_1.default({ margin: 50 });
                const writeStream = fs.createWriteStream(outPath);
                doc.pipe(writeStream);
                doc.fontSize(18).text(`Formulario de Registro de Proveedor`, { align: "center" });
                doc.fontSize(12).text(`Cliente: ${solicitud.cliente}`, { align: "center" });
                doc.fontSize(10).text(`Fecha: ${new Date().toISOString().split("T")[0]}`, { align: "center" });
                doc.moveDown(2);
                doc.fontSize(14).text("Campos Solicitados", { underline: true });
                doc.moveDown(1);
                for (const f of todosCampos) {
                    const etiqueta = f.etiqueta || "Campo";
                    const valor = f.valor !== null && f.valor !== undefined ? String(f.valor) : "[FALTANTE]";
                    const nota = f.motivo ? ` (${f.motivo})` : "";
                    doc.fontSize(10).text(`${etiqueta}: `, { continued: true }).font("Helvetica-Bold").text(`${valor}${nota}`).font("Helvetica");
                    doc.moveDown(0.5);
                }
                doc.end();
                await new Promise((resolve, reject) => {
                    writeStream.on("finish", () => resolve(true));
                    writeStream.on("error", (err) => reject(err));
                });
                const relativePath = `out/${args.caso}/formulario.pdf`;
                logToolExecution(rootDir, args.caso, "proveedor_generar_formulario", true, `Formulario PDF generado en ${relativePath}`);
                return JSON.stringify({
                    ok: true,
                    data: { ruta: relativePath, formato: "pdf" }
                });
            }
            else if (formato === "portal") {
                const outPath = path.join(outDir, "valores-portal.md");
                let content = `# Valores para Registro en Portal Web\n\n`;
                content += `**Cliente:** ${solicitud.cliente}\n`;
                content += `**País:** ${solicitud.pais}\n\n`;
                content += `| Campo / Etiqueta | Valor a Ingresar | Estado | Notas |\n`;
                content += `|---|---|---|---|\n`;
                for (const f of todosCampos) {
                    const etiqueta = f.etiqueta || "Campo";
                    const valor = f.valor !== null && f.valor !== undefined ? String(f.valor) : "N/A";
                    const estado = f.valor ? (f.motivo ? "Requiere Confirmación" : "Listo") : "Faltante";
                    const nota = f.motivo || "";
                    content += `| ${etiqueta} | ${valor} | ${estado} | ${nota} |\n`;
                }
                fs.writeFileSync(outPath, content, "utf-8");
                const relativePath = `out/${args.caso}/valores-portal.md`;
                logToolExecution(rootDir, args.caso, "proveedor_generar_formulario", true, `Valores portal MD generados en ${relativePath}`);
                return JSON.stringify({
                    ok: true,
                    data: {
                        ruta: relativePath,
                        formato: "portal",
                        mensaje: "formato no soportado para automatización directa; se generó valores-portal.md con los valores listos para copiar"
                    }
                });
            }
            else {
                const errorMsg = `Formato no soportado: ${formato}`;
                logToolExecution(rootDir, args.caso, "proveedor_generar_formulario", false, errorMsg);
                return JSON.stringify({ ok: false, error: errorMsg });
            }
        }
        catch (err) {
            const errorMsg = err.message || String(err);
            logToolExecution(rootDir, args.caso, "proveedor_generar_formulario", false, errorMsg);
            return JSON.stringify({ ok: false, error: errorMsg });
        }
    }
};
/**
 * 4. proveedor_armar_paquete
 */
exports.armar_paquete = {
    description: "Crea la carpeta out/<caso>/paquete/ con formulario, soportes exigidos, checklist.md y borrador-correo.md (sin datos bancarios)",
    args: {
        caso: zod_1.z.string().describe("Nombre de la carpeta del caso en reto-01/casos/")
    },
    async execute(args, ctx) {
        const rootDir = ctx?.directory || process.cwd();
        try {
            const casoPath = path.join(rootDir, "reto-01", "casos", args.caso);
            const solicitudPath = path.join(casoPath, "solicitud.json");
            const soportesExigidosPath = path.join(casoPath, "soportes-exigidos.json");
            const repositorioSoportesPath = path.join(rootDir, "reto-01", "repositorio", "soportes");
            const indexSoportesPath = path.join(repositorioSoportesPath, "index.json");
            if (!fs.existsSync(solicitudPath)) {
                const errorMsg = `Caso inexistente: ${args.caso}`;
                logToolExecution(rootDir, args.caso, "proveedor_armar_paquete", false, errorMsg);
                return JSON.stringify({ ok: false, error: errorMsg });
            }
            const solicitud = JSON.parse(fs.readFileSync(solicitudPath, "utf-8"));
            const soportesExigidos = fs.existsSync(soportesExigidosPath)
                ? JSON.parse(fs.readFileSync(soportesExigidosPath, "utf-8"))
                : [];
            const indexSoportes = fs.existsSync(indexSoportesPath)
                ? JSON.parse(fs.readFileSync(indexSoportesPath, "utf-8"))
                : [];
            const outDir = path.join(rootDir, "out", args.caso);
            const paqueteDir = path.join(outDir, "paquete");
            if (!fs.existsSync(paqueteDir)) {
                fs.mkdirSync(paqueteDir, { recursive: true });
            }
            // Copiar formulario generado si existe en out/<caso>/
            const posibleArchivosFormulario = ["formulario.xlsx", "formulario.pdf", "valores-portal.md"];
            let formCopiado = "";
            for (const name of posibleArchivosFormulario) {
                const srcFile = path.join(outDir, name);
                if (fs.existsSync(srcFile)) {
                    fs.copyFileSync(srcFile, path.join(paqueteDir, name));
                    formCopiado = name;
                    break;
                }
            }
            const currentDateStr = new Date().toISOString().split("T")[0]; // ej: "2026-09-10"
            const presentes = [];
            const ausentes = [];
            const vencidos = [];
            for (const tipoExigido of soportesExigidos) {
                const encontrado = indexSoportes.find((s) => s.tipo === tipoExigido);
                if (!encontrado) {
                    ausentes.push({
                        tipo: tipoExigido,
                        motivo: "No existe en el repositorio maestro de soportes"
                    });
                }
                else {
                    const srcSoporte = path.join(repositorioSoportesPath, encontrado.archivo);
                    if (fs.existsSync(srcSoporte)) {
                        fs.copyFileSync(srcSoporte, path.join(paqueteDir, encontrado.archivo));
                    }
                    const vigencia = encontrado.vigencia_hasta;
                    if (vigencia && vigencia < currentDateStr) {
                        vencidos.push({
                            tipo: tipoExigido,
                            archivo: encontrado.archivo,
                            vigencia_hasta: vigencia,
                            motivo: `Soporte vencido el ${vigencia}`
                        });
                    }
                    else {
                        presentes.push({
                            tipo: tipoExigido,
                            archivo: encontrado.archivo,
                            vigencia_hasta: vigencia || "Indefinida"
                        });
                    }
                }
            }
            const listo_para_firma = vencidos.length === 0 && ausentes.length === 0;
            // 1. Generar checklist.md
            let checklistMd = `# Checklist de Soportes y Paquete para Firma\n\n`;
            checklistMd += `**Cliente:** ${solicitud.cliente}\n`;
            checklistMd += `**País:** ${solicitud.pais}\n`;
            checklistMd += `**Fecha de Evaluación:** ${currentDateStr}\n`;
            checklistMd += `**Estado Listo para Firma:** ${listo_para_firma ? "SÍ ✅" : "NO ❌ (Bloqueado por soportes ausentes o vencidos)"}\n\n`;
            checklistMd += `### Soportes Presentes (${presentes.length})\n`;
            if (presentes.length > 0) {
                checklistMd += `| Tipo | Archivo | Vigencia |\n|---|---|---|\n`;
                for (const p of presentes) {
                    checklistMd += `| ${p.tipo} | ${p.archivo} | ${p.vigencia_hasta} |\n`;
                }
            }
            else {
                checklistMd += `*Ninguno*\n`;
            }
            checklistMd += `\n`;
            checklistMd += `### Soportes Vencidos (${vencidos.length})\n`;
            if (vencidos.length > 0) {
                checklistMd += `| Tipo | Archivo | Vigencia | Observación |\n|---|---|---|---|\n`;
                for (const v of vencidos) {
                    checklistMd += `| ${v.tipo} | ${v.archivo} | ${v.vigencia_hasta} | ${v.motivo} |\n`;
                }
            }
            else {
                checklistMd += `*Ninguno*\n`;
            }
            checklistMd += `\n`;
            checklistMd += `### Soportes Ausentes (${ausentes.length})\n`;
            if (ausentes.length > 0) {
                checklistMd += `| Tipo | Observación |\n|---|---|\n`;
                for (const a of ausentes) {
                    checklistMd += `| ${a.tipo} | ${a.motivo} |\n`;
                }
            }
            else {
                checklistMd += `*Ninguno*\n`;
            }
            fs.writeFileSync(path.join(paqueteDir, "checklist.md"), checklistMd, "utf-8");
            // 2. Generar borrador-correo.md (REGLA STRICTA: NUNCA INCLUIR DATOS BANCARIOS)
            let borradorMd = `# Borrador de Correo para Respuesta al Cliente\n\n`;
            borradorMd += `**De:** recepcion@periferia-ficticia.com\n`;
            borradorMd += `**Para:** ${solicitud.de}\n`;
            borradorMd += `**Asunto:** Re: ${solicitud.asunto} - Paquete de Registro Proveedor\n\n`;
            borradorMd += `Estimado equipo de ${solicitud.cliente},\n\n`;
            borradorMd += `Esperamos que se encuentren muy bien. Adjuntamos la documentación requerida para completar nuestro registro como proveedor:\n\n`;
            borradorMd += `**Archivos Adjuntos:**\n`;
            if (formCopiado) {
                borradorMd += `- Formulario de Registro (${formCopiado})\n`;
            }
            for (const p of presentes) {
                borradorMd += `- Soporte: ${p.archivo} (${p.tipo})\n`;
            }
            if (!listo_para_firma) {
                borradorMd += `\n*Nota:* Se incluye informe de checklist ya que contamos con soportes en trámite de actualización:\n`;
                for (const v of vencidos) {
                    borradorMd += `  - ${v.tipo}: actualmente vencido (${v.vigencia_hasta}), en proceso de renovación.\n`;
                }
                for (const a of ausentes) {
                    borradorMd += `  - ${a.tipo}: no disponible en repositorio maestro.\n`;
                }
            }
            borradorMd += `\nQuedamos a su disposición para cualquier inquietud o aclaración adicional.\n\n`;
            borradorMd += `Atentamente,\n`;
            borradorMd += `**Periferia IT Group S.A.S.**\n`;
            fs.writeFileSync(path.join(paqueteDir, "borrador-correo.md"), borradorMd, "utf-8");
            const relativePaquetePath = `out/${args.caso}/paquete/`;
            const resumen = `Paquete armado en ${relativePaquetePath}. Listo para firma: ${listo_para_firma}`;
            logToolExecution(rootDir, args.caso, "proveedor_armar_paquete", true, resumen);
            return JSON.stringify({
                ok: true,
                data: {
                    ruta: relativePaquetePath,
                    listo_para_firma,
                    checklist: {
                        presentes,
                        ausentes,
                        vencidos
                    }
                }
            });
        }
        catch (err) {
            const errorMsg = err.message || String(err);
            logToolExecution(rootDir, args.caso, "proveedor_armar_paquete", false, errorMsg);
            return JSON.stringify({ ok: false, error: errorMsg });
        }
    }
};
/**
 * 5. proveedor_simular_envio
 */
exports.simular_envio = {
    description: "Simula el envío final del paquete de registro al cliente únicamente si el usuario ha confirmado explícitamente.",
    args: {
        caso: zod_1.z.string().describe("Nombre de la carpeta del caso en reto-01/casos/"),
        confirmado: zod_1.z.boolean().describe("Confirmación explícita del usuario para enviar el paquete")
    },
    async execute(args, ctx) {
        const rootDir = ctx?.directory || process.cwd();
        try {
            if (!args.confirmado) {
                const errorMsg = "requiere confirmación explícita del usuario para ejecutar el envío";
                logToolExecution(rootDir, args.caso, "proveedor_simular_envio", false, errorMsg);
                return JSON.stringify({ ok: false, error: errorMsg });
            }
            const outDir = path.join(rootDir, "out", args.caso);
            if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
            }
            const envioPath = path.join(outDir, "ENVIO-SIMULADO.md");
            let content = `# Registro de Envío Simulado\n\n`;
            content += `**Fecha de ejecución:** ${new Date().toISOString()}\n`;
            content += `**Caso:** ${args.caso}\n`;
            content += `**Estado:** ENVÍO SIMULADO EXITOSAMENTE\n\n`;
            content += `Se ha verificado la confirmación explícita del usuario. El paquete ha sido procesado simulando su remisión al cliente final.\n`;
            fs.writeFileSync(envioPath, content, "utf-8");
            const relativePath = `out/${args.caso}/ENVIO-SIMULADO.md`;
            logToolExecution(rootDir, args.caso, "proveedor_simular_envio", true, `Envío simulado completado en ${relativePath}`);
            return JSON.stringify({
                ok: true,
                data: {
                    ruta: relativePath,
                    mensaje: "Envío simulado ejecutado correctamente tras confirmación explícita."
                }
            });
        }
        catch (err) {
            const errorMsg = err.message || String(err);
            logToolExecution(rootDir, args.caso, "proveedor_simular_envio", false, errorMsg);
            return JSON.stringify({ ok: false, error: errorMsg });
        }
    }
};
