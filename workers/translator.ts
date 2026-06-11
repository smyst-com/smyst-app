/**
 * Smyst Translator — Free-only static translator.
 *
 * Project rule:
 * - Only free GitHub and Cloudflare services may be used.
 * - No paid or third-party translation APIs are allowed.
 *
 * This module therefore performs no external API calls. Primary multilingual
 * content lives in repository locale files; this Worker keeps a small compiled
 * exact-text dictionary for edge-rendered HTML cache warming.
 */

export type SupportedLang =
  | 'de'
  | 'en'
  | 'tr'
  | 'fr'
  | 'es'
  | 'pt'
  | 'ar'
  | 'zh'
  | 'ja'
  | 'ko';

export const SUPPORTED_LANGS: SupportedLang[] = [
  'de', 'en', 'tr', 'fr', 'es', 'pt', 'ar', 'zh', 'ja', 'ko',
];

export const DEFAULT_LANG: SupportedLang = 'de';

export const RTL_LANGS: ReadonlySet<SupportedLang> = new Set<SupportedLang>([
  'ar',
]);

export interface TranslatorEnv {
  /** Optional KV for manually prepared translations or future free-only caches. */
  TRANSLATIONS?: KVNamespace;
}

declare global {
  interface KVNamespace {
    get(key: string, type?: 'text'): Promise<string | null>;
    get(key: string, type: 'json'): Promise<unknown | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  }
}

export interface TranslateOptions {
  source?: SupportedLang;
}

type TranslationProvider = 'identity' | 'static';
type StaticDictionary = Partial<Record<SupportedLang, Record<string, string>>>;

const STATIC_TRANSLATIONS: StaticDictionary = {
  en: {
    'smyst.com | KI-Zwillinge, digitale Profile und Twin Chat': 'smyst.com | AI Twins, Digital Profiles and Twin Chat',
    'smyst.com ist eine Free-only KI-Zwilling Plattform fuer digitale Profile, Wissen, Erinnerungen und schnelle Twin-Chats.':
      'smyst.com is a free-only AI twin platform for digital profiles, knowledge, memories and fast twin chats.',
    'smyst.com ist eine Free-only KI-Zwilling Plattform fuer öffentliche und private Profile, Wissen, Erinnerungen und schnelle Twin-Chats.':
      'smyst.com is a free-only AI twin platform for public and private profiles, knowledge, memories and fast twin chats.',
    'KI-Zwillinge, digitale Profile und Twin Chat': 'AI Twins, Digital Profiles and Twin Chat',
    'Twin suchen': 'Search twin',
    'Name oder Twin suchen': 'Search by name or twin',
    'Ausgewählten Twin ändern': 'Change selected twin',
    'Twin wählen': 'Choose twin',
    'Wähle oben einen Namen oder schreibe direkt. Der ausgewählte Twin bleibt oben rechts fixiert.':
      'Choose a name above or start writing. The selected twin stays fixed in the top right.',
    'Datei hinzufügen': 'Add file',
    'Spracheingabe': 'Voice input',
    'Nachricht senden': 'Send message',
  },
  tr: {
    'Twin suchen': 'Twin ara',
    'Name oder Twin suchen': 'İsim veya twin ara',
    'Ausgewählten Twin ändern': "Seçili twin'i değiştir",
    'Twin wählen': 'Twin seç',
    'Wähle oben einen Namen oder schreibe direkt. Der ausgewählte Twin bleibt oben rechts fixiert.':
      'Yukarıdan bir isim seç veya direkt yazmaya başla. Seçili twin sağ üstte sabit kalır.',
    'Datei hinzufügen': 'Dosya ekle',
    'Spracheingabe': 'Sesli giriş',
    'Nachricht senden': 'Mesaj gönder',
  },
  fr: {
    'Twin suchen': 'Rechercher un twin',
    'Name oder Twin suchen': 'Rechercher par nom ou twin',
    'Ausgewählten Twin ändern': 'Changer le twin sélectionné',
    'Twin wählen': 'Choisir un twin',
    'Wähle oben einen Namen oder schreibe direkt. Der ausgewählte Twin bleibt oben rechts fixiert.':
      'Choisis un nom en haut ou écris directement. Le twin sélectionné reste fixé en haut à droite.',
    'Datei hinzufügen': 'Ajouter un fichier',
    'Spracheingabe': 'Saisie vocale',
    'Nachricht senden': 'Envoyer le message',
  },
  es: {
    'Twin suchen': 'Buscar twin',
    'Name oder Twin suchen': 'Buscar por nombre o twin',
    'Ausgewählten Twin ändern': 'Cambiar twin seleccionado',
    'Twin wählen': 'Elegir twin',
    'Wähle oben einen Namen oder schreibe direkt. Der ausgewählte Twin bleibt oben rechts fixiert.':
      'Elige un nombre arriba o escribe directamente. El twin seleccionado queda fijo arriba a la derecha.',
    'Datei hinzufügen': 'Añadir archivo',
    'Spracheingabe': 'Entrada de voz',
    'Nachricht senden': 'Enviar mensaje',
  },
  pt: {
    'Twin suchen': 'Pesquisar twin',
    'Name oder Twin suchen': 'Pesquisar por nome ou twin',
    'Ausgewählten Twin ändern': 'Alterar twin selecionado',
    'Twin wählen': 'Escolher twin',
    'Wähle oben einen Namen oder schreibe direkt. Der ausgewählte Twin bleibt oben rechts fixiert.':
      'Escolhe um nome acima ou escreve diretamente. O twin selecionado fica fixo no canto superior direito.',
    'Datei hinzufügen': 'Adicionar ficheiro',
    'Spracheingabe': 'Entrada de voz',
    'Nachricht senden': 'Enviar mensagem',
  },
  ar: {
    'Twin suchen': 'البحث عن Twin',
    'Name oder Twin suchen': 'ابحث بالاسم أو Twin',
    'Ausgewählten Twin ändern': 'تغيير الـ Twin المحدد',
    'Twin wählen': 'اختر Twin',
    'Wähle oben einen Namen oder schreibe direkt. Der ausgewählte Twin bleibt oben rechts fixiert.':
      'اختر اسما من الأعلى أو ابدأ بالكتابة مباشرة. يبقى الـ Twin المحدد مثبتا في الأعلى يمينا.',
    'Datei hinzufügen': 'إضافة ملف',
    'Spracheingabe': 'إدخال صوتي',
    'Nachricht senden': 'إرسال الرسالة',
  },
  zh: {
    'Twin suchen': '搜索 Twin',
    'Name oder Twin suchen': '按姓名或 Twin 搜索',
    'Ausgewählten Twin ändern': '更改所选 Twin',
    'Twin wählen': '选择 Twin',
    'Wähle oben einen Namen oder schreibe direkt. Der ausgewählte Twin bleibt oben rechts fixiert.':
      '在上方选择姓名，或直接开始输入。所选 Twin 会固定在右上角。',
    'Datei hinzufügen': '添加文件',
    'Spracheingabe': '语音输入',
    'Nachricht senden': '发送消息',
  },
  ja: {
    'Twin suchen': 'Twin を検索',
    'Name oder Twin suchen': '名前または Twin を検索',
    'Ausgewählten Twin ändern': '選択中の Twin を変更',
    'Twin wählen': 'Twin を選択',
    'Wähle oben einen Namen oder schreibe direkt. Der ausgewählte Twin bleibt oben rechts fixiert.':
      '上で名前を選ぶか、そのまま入力してください。選択した Twin は右上に固定されます。',
    'Datei hinzufügen': 'ファイルを追加',
    'Spracheingabe': '音声入力',
    'Nachricht senden': 'メッセージを送信',
  },
  ko: {
    'Twin suchen': 'Twin 검색',
    'Name oder Twin suchen': '이름 또는 Twin 검색',
    'Ausgewählten Twin ändern': '선택한 Twin 변경',
    'Twin wählen': 'Twin 선택',
    'Wähle oben einen Namen oder schreibe direkt. Der ausgewählte Twin bleibt oben rechts fixiert.':
      '위에서 이름을 선택하거나 바로 입력하세요. 선택한 Twin은 오른쪽 위에 고정됩니다.',
    'Datei hinzufügen': '파일 추가',
    'Spracheingabe': '음성 입력',
    'Nachricht senden': '메시지 보내기',
  },
};

export async function translateBatch(
  texts: string[],
  target: SupportedLang,
  _env: TranslatorEnv,
  options: TranslateOptions = {},
): Promise<{ translations: string[]; provider: TranslationProvider; ok: boolean }> {
  const source = options.source ?? DEFAULT_LANG;

  if (target === source || texts.length === 0) {
    return { translations: texts, provider: 'identity', ok: true };
  }

  if (source !== DEFAULT_LANG) {
    return { translations: texts, provider: 'identity', ok: false };
  }

  const dictionary = STATIC_TRANSLATIONS[target] ?? {};
  let missing = 0;
  const translations = texts.map((text) => {
    const trimmed = text.trim();
    const translated = dictionary[trimmed];
    if (!translated) {
      missing++;
      return text;
    }
    const leading = text.match(/^\s*/)?.[0] ?? '';
    const trailing = text.match(/\s*$/)?.[0] ?? '';
    return `${leading}${translated}${trailing}`;
  });

  return { translations, provider: 'static', ok: missing === 0 };
}

export function isRtl(lang: SupportedLang): boolean {
  return RTL_LANGS.has(lang);
}

export function toSupportedLang(raw: string | null | undefined): SupportedLang {
  if (!raw) return DEFAULT_LANG;
  const norm = raw.toLowerCase().split(/[-_]/)[0] as SupportedLang;
  return SUPPORTED_LANGS.includes(norm) ? norm : DEFAULT_LANG;
}
