import { primaryLocales, type PrimaryLocale } from "@/lib/seo";

export const locales = primaryLocales;

export type Locale = PrimaryLocale;

export type Dictionary = {
  nav: {
    home: string;
    twins: string;
    chat: string;
    profile: string;
    creator: string;
  };
  hero: {
    title: string;
    copy: string;
    metricLatency: string;
    metricSafety: string;
    metricReach: string;
  };
  twins: {
    title: string;
    active: string;
  };
  chat: {
    title: string;
    placeholder: string;
    send: string;
    assistant: string;
    user: string;
  };
  profile: {
    title: string;
    owner: string;
    region: string;
    privacy: string;
  };
  creator: {
    title: string;
    name: string;
    purpose: string;
    visibility: string;
    notes: string;
    save: string;
    reset: string;
  };
  pwa: {
    label: string;
  };
};

const dictionaries: Record<Locale, Dictionary> = {
  de: {
    nav: { home: "Start", twins: "Twins", chat: "Chat", profile: "Profil", creator: "Creator" },
    hero: {
      title: "Smyst AI Twins",
      copy:
        "Waehle einen Twin, pruefe sein Profil und starte einen schnellen, sicheren Chat mit nachvollziehbarem Memory-Kontext.",
      metricLatency: "Chat-Start",
      metricSafety: "Private Basis",
      metricReach: "Mehrsprachig",
    },
    twins: { title: "Twin-Auswahl", active: "aktiv" },
    chat: {
      title: "Chat UI",
      placeholder: "Frage den ausgewaehlten Twin...",
      send: "Senden",
      assistant: "Twin",
      user: "Du",
    },
    profile: {
      title: "Profile",
      owner: "Owner",
      region: "Region",
      privacy: "Datenschutz",
    },
    creator: {
      title: "Twin Creator",
      name: "Name",
      purpose: "Zweck",
      visibility: "Sichtbarkeit",
      notes: "Initiale Memory-Notizen",
      save: "Entwurf speichern",
      reset: "Zuruecksetzen",
    },
    pwa: { label: "PWA bereit" },
  },
  en: {
    nav: { home: "Home", twins: "Twins", chat: "Chat", profile: "Profile", creator: "Creator" },
    hero: {
      title: "Smyst AI Twins",
      copy:
        "Select a twin, review the profile, and start a fast, safe chat grounded in memory context.",
      metricLatency: "Chat start",
      metricSafety: "Private base",
      metricReach: "Multilingual",
    },
    twins: { title: "Twin selection", active: "active" },
    chat: {
      title: "Chat UI",
      placeholder: "Ask the selected twin...",
      send: "Send",
      assistant: "Twin",
      user: "You",
    },
    profile: {
      title: "Profile",
      owner: "Owner",
      region: "Region",
      privacy: "Privacy",
    },
    creator: {
      title: "Twin Creator",
      name: "Name",
      purpose: "Purpose",
      visibility: "Visibility",
      notes: "Initial memory notes",
      save: "Save draft",
      reset: "Reset",
    },
    pwa: { label: "PWA ready" },
  },
  tr: {
    nav: { home: "Baslangic", twins: "Twinler", chat: "Sohbet", profile: "Profil", creator: "Olustur" },
    hero: {
      title: "Smyst AI Twins",
      copy: "Bir twin sec, profilini incele ve bellek baglamina dayanan guvenli sohbete basla.",
      metricLatency: "Sohbet baslangici",
      metricSafety: "Gizli temel",
      metricReach: "Cok dilli",
    },
    twins: { title: "Twin secimi", active: "aktif" },
    chat: { title: "Chat UI", placeholder: "Secili twin'e sor...", send: "Gonder", assistant: "Twin", user: "Sen" },
    profile: { title: "Profile", owner: "Sahip", region: "Bolge", privacy: "Gizlilik" },
    creator: {
      title: "Twin Creator",
      name: "Ad",
      purpose: "Amac",
      visibility: "Gorunurluk",
      notes: "Ilk bellek notlari",
      save: "Taslagi kaydet",
      reset: "Sifirla",
    },
    pwa: { label: "PWA hazir" },
  },
  fr: {
    nav: { home: "Accueil", twins: "Twins", chat: "Chat", profile: "Profil", creator: "Creator" },
    hero: {
      title: "Smyst AI Twins",
      copy: "Selectionnez un twin, verifiez son profil et lancez un chat rapide et sur.",
      metricLatency: "Demarrage chat",
      metricSafety: "Base privee",
      metricReach: "Multilingue",
    },
    twins: { title: "Selection twin", active: "actif" },
    chat: { title: "Chat UI", placeholder: "Posez une question au twin...", send: "Envoyer", assistant: "Twin", user: "Vous" },
    profile: { title: "Profile", owner: "Owner", region: "Region", privacy: "Confidentialite" },
    creator: {
      title: "Twin Creator",
      name: "Nom",
      purpose: "Objectif",
      visibility: "Visibilite",
      notes: "Notes memoire initiales",
      save: "Sauver",
      reset: "Reinitialiser",
    },
    pwa: { label: "PWA pret" },
  },
  es: {
    nav: { home: "Inicio", twins: "Twins", chat: "Chat", profile: "Perfil", creator: "Creator" },
    hero: {
      title: "Smyst AI Twins",
      copy: "Elige un twin, revisa su perfil e inicia un chat rapido y seguro con contexto de memoria.",
      metricLatency: "Inicio chat",
      metricSafety: "Base privada",
      metricReach: "Multilingue",
    },
    twins: { title: "Seleccion twin", active: "activo" },
    chat: { title: "Chat UI", placeholder: "Pregunta al twin seleccionado...", send: "Enviar", assistant: "Twin", user: "Tu" },
    profile: { title: "Profile", owner: "Owner", region: "Region", privacy: "Privacidad" },
    creator: {
      title: "Twin Creator",
      name: "Nombre",
      purpose: "Proposito",
      visibility: "Visibilidad",
      notes: "Notas iniciales",
      save: "Guardar",
      reset: "Restablecer",
    },
    pwa: { label: "PWA lista" },
  },
  zh: {
    nav: { home: "首页", twins: "AI 分身", chat: "聊天", profile: "资料", creator: "创建" },
    hero: {
      title: "Smyst AI 数字分身",
      copy: "创建、保存、搜索并对话由知识、记忆、文档和媒体构建的安全 AI 数字分身。",
      metricLatency: "快速聊天",
      metricSafety: "隐私基础",
      metricReach: "多语言",
    },
    twins: { title: "分身选择", active: "已选择" },
    chat: { title: "聊天", placeholder: "向选中的 AI 分身提问...", send: "发送", assistant: "分身", user: "你" },
    profile: { title: "资料", owner: "所有者", region: "地区", privacy: "隐私" },
    creator: {
      title: "Twin Creator",
      name: "名称",
      purpose: "用途",
      visibility: "可见性",
      notes: "初始记忆",
      save: "保存草稿",
      reset: "重置",
    },
    pwa: { label: "PWA 就绪" },
  },
  ar: {
    nav: { home: "الرئيسية", twins: "التوائم", chat: "الدردشة", profile: "الملف", creator: "الإنشاء" },
    hero: {
      title: "Smyst التوائم الرقمية بالذكاء الاصطناعي",
      copy: "أنشئ واحفظ وابحث وتحدث مع توأم رقمي آمن مبني من المعرفة والذكريات والوثائق والوسائط.",
      metricLatency: "دردشة سريعة",
      metricSafety: "أساس خاص",
      metricReach: "متعدد اللغات",
    },
    twins: { title: "اختيار التوأم", active: "نشط" },
    chat: { title: "الدردشة", placeholder: "اسأل التوأم المختار...", send: "إرسال", assistant: "التوأم", user: "أنت" },
    profile: { title: "الملف", owner: "المالك", region: "المنطقة", privacy: "الخصوصية" },
    creator: {
      title: "Twin Creator",
      name: "الاسم",
      purpose: "الغرض",
      visibility: "الظهور",
      notes: "ملاحظات الذاكرة الأولى",
      save: "حفظ المسودة",
      reset: "إعادة ضبط",
    },
    pwa: { label: "PWA جاهز" },
  },
  pt: {
    nav: { home: "Inicio", twins: "Twins", chat: "Chat", profile: "Perfil", creator: "Criador" },
    hero: {
      title: "Smyst Gemeos de IA",
      copy: "Crie, preserve, pesquise e converse com gemeos digitais de IA baseados em conhecimento, memorias, documentos e midia.",
      metricLatency: "Chat rapido",
      metricSafety: "Base privada",
      metricReach: "Multilingue",
    },
    twins: { title: "Selecao de twin", active: "ativo" },
    chat: { title: "Chat", placeholder: "Pergunte ao twin selecionado...", send: "Enviar", assistant: "Twin", user: "Voce" },
    profile: { title: "Perfil", owner: "Owner", region: "Regiao", privacy: "Privacidade" },
    creator: {
      title: "Twin Creator",
      name: "Nome",
      purpose: "Objetivo",
      visibility: "Visibilidade",
      notes: "Notas iniciais de memoria",
      save: "Salvar rascunho",
      reset: "Redefinir",
    },
    pwa: { label: "PWA pronto" },
  },
  ru: {
    nav: { home: "Главная", twins: "Двойники", chat: "Чат", profile: "Профиль", creator: "Создать" },
    hero: {
      title: "Smyst ИИ-двойники",
      copy: "Создавайте, храните, ищите и обсуждайте безопасных цифровых ИИ-двойников на основе знаний, памяти, документов и медиа.",
      metricLatency: "Быстрый чат",
      metricSafety: "Приватная база",
      metricReach: "Многоязычно",
    },
    twins: { title: "Выбор двойника", active: "активен" },
    chat: { title: "Чат", placeholder: "Спросите выбранного двойника...", send: "Отправить", assistant: "Двойник", user: "Вы" },
    profile: { title: "Профиль", owner: "Владелец", region: "Регион", privacy: "Приватность" },
    creator: {
      title: "Twin Creator",
      name: "Имя",
      purpose: "Цель",
      visibility: "Видимость",
      notes: "Первые заметки памяти",
      save: "Сохранить черновик",
      reset: "Сбросить",
    },
    pwa: { label: "PWA готово" },
  },
  ja: {
    nav: { home: "ホーム", twins: "ツイン", chat: "チャット", profile: "プロフィール", creator: "作成" },
    hero: {
      title: "Smyst AI デジタルツイン",
      copy: "知識、記憶、文書、メディアから安全な AI デジタルツインを作成、保存、検索し、対話できます。",
      metricLatency: "高速チャット",
      metricSafety: "プライベート基盤",
      metricReach: "多言語",
    },
    twins: { title: "ツイン選択", active: "有効" },
    chat: { title: "チャット", placeholder: "選択したツインに質問...", send: "送信", assistant: "ツイン", user: "あなた" },
    profile: { title: "プロフィール", owner: "所有者", region: "地域", privacy: "プライバシー" },
    creator: {
      title: "Twin Creator",
      name: "名前",
      purpose: "目的",
      visibility: "公開範囲",
      notes: "初期メモリー",
      save: "下書き保存",
      reset: "リセット",
    },
    pwa: { label: "PWA 対応" },
  },
  ko: {
    nav: { home: "홈", twins: "트윈", chat: "채팅", profile: "프로필", creator: "생성" },
    hero: {
      title: "Smyst AI 디지털 트윈",
      copy: "지식, 기억, 문서, 미디어로 만든 안전한 AI 디지털 트윈을 만들고 보존하고 검색하고 대화하세요.",
      metricLatency: "빠른 채팅",
      metricSafety: "비공개 기반",
      metricReach: "다국어",
    },
    twins: { title: "트윈 선택", active: "활성" },
    chat: { title: "채팅", placeholder: "선택한 트윈에게 질문...", send: "보내기", assistant: "트윈", user: "나" },
    profile: { title: "프로필", owner: "소유자", region: "지역", privacy: "개인정보" },
    creator: {
      title: "Twin Creator",
      name: "이름",
      purpose: "목적",
      visibility: "공개 범위",
      notes: "초기 메모리",
      save: "초안 저장",
      reset: "초기화",
    },
    pwa: { label: "PWA 준비됨" },
  },
  it: {
    nav: { home: "Home", twins: "Twin", chat: "Chat", profile: "Profilo", creator: "Creator" },
    hero: {
      title: "Smyst Gemelli IA",
      copy: "Crea, conserva, cerca e conversa con gemelli digitali IA sicuri basati su conoscenze, ricordi, documenti e media.",
      metricLatency: "Chat rapido",
      metricSafety: "Base privata",
      metricReach: "Multilingue",
    },
    twins: { title: "Selezione twin", active: "attivo" },
    chat: { title: "Chat", placeholder: "Chiedi al twin selezionato...", send: "Invia", assistant: "Twin", user: "Tu" },
    profile: { title: "Profilo", owner: "Owner", region: "Regione", privacy: "Privacy" },
    creator: {
      title: "Twin Creator",
      name: "Nome",
      purpose: "Scopo",
      visibility: "Visibilita",
      notes: "Note memoria iniziali",
      save: "Salva bozza",
      reset: "Reimposta",
    },
    pwa: { label: "PWA pronta" },
  },
  hi: {
    nav: { home: "होम", twins: "ट्विन", chat: "चैट", profile: "प्रोफाइल", creator: "बनाएं" },
    hero: {
      title: "Smyst AI डिजिटल ट्विन",
      copy: "ज्ञान, यादों, दस्तावेजों और मीडिया से सुरक्षित डिजिटल AI ट्विन बनाएं, सहेजें, खोजें और उनसे बात करें।",
      metricLatency: "तेज चैट",
      metricSafety: "निजी आधार",
      metricReach: "बहुभाषी",
    },
    twins: { title: "ट्विन चयन", active: "सक्रिय" },
    chat: { title: "चैट", placeholder: "चुने हुए ट्विन से पूछें...", send: "भेजें", assistant: "ट्विन", user: "आप" },
    profile: { title: "प्रोफाइल", owner: "स्वामी", region: "क्षेत्र", privacy: "गोपनीयता" },
    creator: {
      title: "Twin Creator",
      name: "नाम",
      purpose: "उद्देश्य",
      visibility: "दृश्यता",
      notes: "प्रारंभिक मेमोरी नोट्स",
      save: "ड्राफ्ट सहेजें",
      reset: "रीसेट",
    },
    pwa: { label: "PWA तैयार" },
  },
  id: {
    nav: { home: "Beranda", twins: "Twin", chat: "Chat", profile: "Profil", creator: "Pembuat" },
    hero: {
      title: "Smyst AI Twins",
      copy: "Buat, simpan, cari, dan bicara dengan AI twin digital yang aman dari pengetahuan, ingatan, dokumen, dan media.",
      metricLatency: "Chat cepat",
      metricSafety: "Basis privat",
      metricReach: "Multibahasa",
    },
    twins: { title: "Pilihan twin", active: "aktif" },
    chat: { title: "Chat", placeholder: "Tanya twin yang dipilih...", send: "Kirim", assistant: "Twin", user: "Anda" },
    profile: { title: "Profil", owner: "Owner", region: "Wilayah", privacy: "Privasi" },
    creator: {
      title: "Twin Creator",
      name: "Nama",
      purpose: "Tujuan",
      visibility: "Visibilitas",
      notes: "Catatan memori awal",
      save: "Simpan draf",
      reset: "Reset",
    },
    pwa: { label: "PWA siap" },
  },
  bn: {
    nav: { home: "হোম", twins: "টুইন", chat: "চ্যাট", profile: "প্রোফাইল", creator: "তৈরি" },
    hero: {
      title: "Smyst AI ডিজিটাল টুইন",
      copy: "জ্ঞান, স্মৃতি, নথি ও মিডিয়া থেকে নিরাপদ ডিজিটাল AI টুইন তৈরি, সংরক্ষণ, অনুসন্ধান ও কথোপকথন করুন।",
      metricLatency: "দ্রুত চ্যাট",
      metricSafety: "ব্যক্তিগত ভিত্তি",
      metricReach: "বহুভাষিক",
    },
    twins: { title: "টুইন নির্বাচন", active: "সক্রিয়" },
    chat: { title: "চ্যাট", placeholder: "নির্বাচিত টুইনকে প্রশ্ন করুন...", send: "পাঠান", assistant: "টুইন", user: "আপনি" },
    profile: { title: "প্রোফাইল", owner: "মালিক", region: "অঞ্চল", privacy: "গোপনীয়তা" },
    creator: {
      title: "Twin Creator",
      name: "নাম",
      purpose: "উদ্দেশ্য",
      visibility: "দৃশ্যমানতা",
      notes: "প্রাথমিক মেমরি নোট",
      save: "খসড়া সংরক্ষণ",
      reset: "রিসেট",
    },
    pwa: { label: "PWA প্রস্তুত" },
  },
};

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
