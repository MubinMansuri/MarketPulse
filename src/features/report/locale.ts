import type { Locale } from "./model";

export interface UiLabels {
  import: string;
  preview: string;
  backToEditor: string;
  export: string;
  reportEditor: string;
  documentPreview: string;
  reportStructure: string;
  sections: string;
  addSection: string;
  documentProperties: string;
  reportDetails: string;
  brandName: string;
  reportTitle: string;
  reportDate: string;
  sourceLanguage: string;
  targetLanguage: string;
  interfaceLanguage: string;
  pageSettings: string;
  format: string;
  margins: string;
  pageCount: string;
  selectedSection: string;
  sectionTitle: string;
  foundationChecks: string;
  basicStructureChecked: string;
  runtimeValidation: string;
  localWorkspace: string;
  localSession: string;
  translate: string;
  translating: string;
  translationUnavailable: string;
  translationComplete: string;
  translationWarnings: string;
  englishOriginal: string;
  printPdf: string;
  saveHtml: string;
  exportReport: string;
  cancel: string;
  replaceReport: string;
  unknownSection: string;
  chartPending: string;
  chartFailed: string;
}

const labels: Record<Locale, UiLabels> = {
  en: {
    import: "Import",
    preview: "Preview",
    backToEditor: "Back to editor",
    export: "Export",
    reportEditor: "REPORT EDITOR",
    documentPreview: "DOCUMENT PREVIEW",
    reportStructure: "Report structure",
    sections: "SECTIONS",
    addSection: "Add section",
    documentProperties: "Document properties",
    reportDetails: "REPORT DETAILS",
    brandName: "Brand name on report",
    reportTitle: "Report title",
    reportDate: "Report date",
    sourceLanguage: "Source language",
    targetLanguage: "Target language",
    interfaceLanguage: "Interface language",
    pageSettings: "PAGE SETTINGS",
    format: "Format",
    margins: "Margins",
    pageCount: "Page count",
    selectedSection: "SELECTED SECTION",
    sectionTitle: "Section title",
    foundationChecks: "FOUNDATION CHECKS",
    basicStructureChecked: "Basic structure checked",
    runtimeValidation: "Runtime schema and translation checks run in this session.",
    localWorkspace: "Local workspace",
    localSession: "Local session",
    translate: "Translate report",
    translating: "Translating…",
    translationUnavailable: "Translation service unavailable; report remains editable.",
    translationComplete: "Translation complete",
    translationWarnings: "Translation needs review",
    englishOriginal: "English (original)",
    printPdf: "Print / Save PDF",
    saveHtml: "Save HTML",
    exportReport: "Export report",
    cancel: "Cancel",
    replaceReport: "Replace report",
    unknownSection: "Unknown section",
    chartPending: "Chart image pending",
    chartFailed: "Chart image failed to load",
  },
  es: {
    import: "Importar",
    preview: "Vista previa",
    backToEditor: "Volver al editor",
    export: "Exportar",
    reportEditor: "EDITOR DEL INFORME",
    documentPreview: "VISTA PREVIA DEL DOCUMENTO",
    reportStructure: "Estructura del informe",
    sections: "SECCIONES",
    addSection: "Añadir sección",
    documentProperties: "Propiedades del documento",
    reportDetails: "DATOS DEL INFORME",
    brandName: "Marca en el informe",
    reportTitle: "Título del informe",
    reportDate: "Fecha del informe",
    sourceLanguage: "Idioma de origen",
    targetLanguage: "Idioma de destino",
    interfaceLanguage: "Idioma de la interfaz",
    pageSettings: "CONFIGURACIÓN DE PÁGINA",
    format: "Formato",
    margins: "Márgenes",
    pageCount: "Número de páginas",
    selectedSection: "SECCIÓN SELECCIONADA",
    sectionTitle: "Título de sección",
    foundationChecks: "COMPROBACIONES",
    basicStructureChecked: "Estructura básica comprobada",
    runtimeValidation: "El esquema y la traducción se comprueban en esta sesión.",
    localWorkspace: "Espacio de trabajo local",
    localSession: "Sesión local",
    translate: "Traducir informe",
    translating: "Traduciendo…",
    translationUnavailable: "Servicio de traducción no disponible; el informe sigue editable.",
    translationComplete: "Traducción completa",
    translationWarnings: "La traducción requiere revisión",
    englishOriginal: "Inglés (original)",
    printPdf: "Imprimir / Guardar PDF",
    saveHtml: "Guardar HTML",
    exportReport: "Exportar informe",
    cancel: "Cancelar",
    replaceReport: "Reemplazar informe",
    unknownSection: "Sección desconocida",
    chartPending: "Imagen del gráfico pendiente",
    chartFailed: "No se pudo cargar la imagen del gráfico",
  },
  ar: {
    import: "استيراد",
    preview: "معاينة",
    backToEditor: "العودة إلى المحرر",
    export: "تصدير",
    reportEditor: "محرر التقرير",
    documentPreview: "معاينة المستند",
    reportStructure: "هيكل التقرير",
    sections: "الأقسام",
    addSection: "إضافة قسم",
    documentProperties: "خصائص المستند",
    reportDetails: "تفاصيل التقرير",
    brandName: "العلامة التجارية في التقرير",
    reportTitle: "عنوان التقرير",
    reportDate: "تاريخ التقرير",
    sourceLanguage: "لغة المصدر",
    targetLanguage: "اللغة المستهدفة",
    interfaceLanguage: "لغة الواجهة",
    pageSettings: "إعدادات الصفحة",
    format: "التنسيق",
    margins: "الهوامش",
    pageCount: "عدد الصفحات",
    selectedSection: "القسم المحدد",
    sectionTitle: "عنوان القسم",
    foundationChecks: "فحوصات التحقق",
    basicStructureChecked: "تم التحقق من الهيكل الأساسي",
    runtimeValidation: "يتم التحقق من المخطط والترجمة في هذه الجلسة.",
    localWorkspace: "مساحة العمل المحلية",
    localSession: "جلسة محلية",
    translate: "ترجمة التقرير",
    translating: "جارٍ الترجمة…",
    translationUnavailable: "خدمة الترجمة غير متاحة؛ يبقى التقرير قابلاً للتحرير.",
    translationComplete: "اكتملت الترجمة",
    translationWarnings: "الترجمة تحتاج إلى مراجعة",
    englishOriginal: "الإنجليزية (الأصلية)",
    printPdf: "طباعة / حفظ PDF",
    saveHtml: "حفظ HTML",
    exportReport: "تصدير التقرير",
    cancel: "إلغاء",
    replaceReport: "استبدال التقرير",
    unknownSection: "قسم غير معروف",
    chartPending: "بانتظار صورة الرسم البياني",
    chartFailed: "تعذر تحميل صورة الرسم البياني",
  },
};

export const localeNames: Record<Locale, string> = { en: "English", es: "Español", ar: "العربية" };
export function getUiLabels(locale: Locale): UiLabels {
  return labels[locale];
}
export function isRtlLocale(locale: Locale): boolean {
  return locale === "ar";
}
export function formatReportDate(date: string, locale: Locale): string {
  const localeTag = locale === "es" ? "es-ES" : locale === "ar" ? "ar-EG" : "en-GB";
  return new Date(date + "T12:00:00").toLocaleDateString(localeTag, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
