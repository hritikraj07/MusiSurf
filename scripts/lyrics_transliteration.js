// ============================================================================
// MUSISURF - Multilingual Lyrics Engine & Transliteration
// Accurately converts Romanized Hindi to Devanagari while preserving words,
// meaning, and LRC timestamps. Detects native scripts (Devanagari, Gurmukhi, Urdu).
// ============================================================================

const COMMON_HINDI_WORDS = {
  // Pronouns & Demonstratives
  'main': 'मैं', 'mai': 'मैं', 'me': 'में', 'mein': 'में', 'hum': 'हम', 'ham': 'हम',
  'tu': 'तू', 'tum': 'तुम', 'aap': 'आप', 'tera': 'तेरा', 'teri': 'तेरी', 'tere': 'तेरे',
  'mera': 'मेरा', 'meri': 'मेरी', 'mere': 'मेरे', 'apna': 'अपना', 'apni': 'अपनी', 'apne': 'अपने',
  'mujhe': 'मुझे', 'tujhe': 'तुझे', 'humein': 'हमें', 'tumhein': 'तुम्हें', 'tujh': 'तुझ', 'mujh': 'मुझ',
  'uska': 'उसका', 'uski': 'उसकी', 'uske': 'उसके', 'unka': 'उनका', 'unki': 'उनकी', 'unke': 'उनके',
  'is': 'इस', 'us': 'उस', 'in': 'इन', 'un': 'उन', 'yeh': 'यह', 'ye': 'ये', 'woh': 'वह', 'wo': 'वो',
  'koi': 'कोई', 'kuch': 'कुछ', 'kuchh': 'कुछ', 'sab': 'सब', 'sabhi': 'सभी', 'kisi': 'किसी', 'jo': 'जो', 'so': 'सो',

  // Auxiliaries & Particles
  'hai': 'है', 'hain': 'हैं', 'ho': 'हो', 'hoon': 'हूँ', 'hu': 'हूँ', 'hun': 'हूँ',
  'tha': 'था', 'thi': 'थी', 'the': 'थे', 'ka': 'का', 'ki': 'की', 'ke': 'के',
  'ko': 'को', 'se': 'से', 'par': 'पर', 'pe': 'पे', 'tak': 'तक', 'bhi': 'भी',
  'bin': 'बिन', 'bina': 'बिना', 'ab': 'अब', 'jab': 'जब', 'tab': 'तब', 'kab': 'कब',
  'agar': 'अगर', 'magar': 'मगर', 'lekin': 'लेकिन', 'par': 'पर',
  'to': 'तो', 'toh': 'तो', 'hi': 'ही', 'na': 'ना', 'nahi': 'नहीं', 'nahin': 'नहीं',
  'mat': 'मत', 'aur': 'और', 'ya': 'या', 'sirf': 'सिर्फ़', 'bas': 'बस', 'khud': 'ख़ुद',
  'kyunki': 'क्योंकि', 'kyonki': 'क्योंकि', 'kyun': 'क्यों', 'kyon': 'क्यों',
  'kya': 'क्या', 'kaise': 'कैसे', 'kahan': 'कहाँ', 'kaha': 'कहा',

  // Common Verbs & Participles
  'reh': 'रह', 'raha': 'रहा', 'rahi': 'रही', 'rahe': 'रहे', 'rehna': 'रहना',
  'kar': 'कर', 'kara': 'करा', 'kare': 'करे', 'karo': 'करो', 'karna': 'करना', 'karte': 'करते', 'karta': 'करता', 'karti': 'करती',
  'de': 'दे', 'do': 'दो', 'diya': 'दिया', 'di': 'दी', 'dena': 'देना', 'dete': 'देते',
  'le': 'ले', 'lo': 'लो', 'liya': 'लिया', 'li': 'ली', 'lena': 'लेना',
  'aa': 'आ', 'aao': 'आओ', 'aaya': 'आया', 'aayi': 'आयी', 'aaye': 'आए', 'aana': 'आना',
  'ja': 'जा', 'jaao': 'जाओ', 'gaya': 'गया', 'gayi': 'गयी', 'gaye': 'गए', 'jaana': 'जाना', 'jaate': 'जाते', 'jaayenge': 'जाएंगे',
  'dekh': 'देख', 'dekho': 'देखो', 'dekha': 'देखा', 'dekhi': 'देखी', 'dekhna': 'देखना',
  'sun': 'सुन', 'suno': 'सुनो', 'suna': 'सुना', 'suni': 'सुनी', 'sunna': 'सुनना',
  'bol': 'बोल', 'bolo': 'बोलो', 'bola': 'बोला', 'boli': 'बोली', 'bolna': 'बोलना',
  'keh': 'कह', 'kaho': 'कहो', 'kehte': 'कहते', 'kehta': 'कहता', 'kehti': 'कहती',
  'chal': 'चल', 'chalo': 'चलो', 'chala': 'चला', 'chali': 'चली', 'chale': 'चले', 'chalna': 'चलना',
  'mil': 'मिल', 'milo': 'मिलो', 'mila': 'मिला', 'mili': 'मिली', 'mile': 'मिले', 'milna': 'मिलना',
  'jee': 'जी', 'jeena': 'जीना', 'mar': 'मर', 'marna': 'मरना', 'hoke': 'होके', 'hokar': 'होकर',
  'jaane': 'जाने', 'maane': 'माने', 'paaye': 'पाए', 'sakta': 'सकता', 'sakti': 'सकती', 'sakte': 'सकते',

  // Core Bollywood Themes (Love, Heart, Romance, Night, Tears)
  'dil': 'दिल', 'dilon': 'दिलों', 'jaan': 'जान', 'dhadkan': 'धड़कन', 'dhadkanein': 'धड़कनें',
  'pyar': 'प्यार', 'pyaar': 'प्यार', 'ishq': 'इश्क़', 'mohabbat': 'मोहब्बत', 'aashiqui': 'आशिक़ी', 'ashiqui': 'आशिक़ी',
  'chaahat': 'चाहत', 'chahat': 'चाहत', 'deewana': 'दीवाना', 'deewani': 'दीवानी', 'deewane': 'दीवाने',
  'sanam': 'सनम', 'yaara': 'यारा', 'yaar': 'यार', 'yaari': 'यारी', 'dost': 'दोस्त', 'dosti': 'दोस्ती',
  'duniya': 'दुनिया', 'jahaan': 'जहाँ', 'jahan': 'जहाँ', 'zameen': 'ज़मीन', 'aasmaan': 'आसमान', 'aasman': 'आसमान', 'falak': 'फलक',
  'chaand': 'चाँद', 'chand': 'चाँद', 'chaandni': 'चाँदनी', 'taare': 'तारे', 'taara': 'तारा', 'sooraj': 'सूरज',
  'raat': 'रात', 'raaton': 'रातों', 'raatein': 'रातें', 'subah': 'सुबह', 'shaam': 'शाम', 'din': 'दिन',
  'hawa': 'हवा', 'hawaon': 'हवाओं', 'baadal': 'बादल', 'barsaat': 'बरसात', 'barish': 'बारिश', 'saawan': 'सावन',
  'aankh': 'आँख', 'aankhen': 'आँखें', 'aankhon': 'आँखों', 'nazar': 'नज़र', 'nazrein': 'नज़रें', 'drishti': 'दृष्टि',
  'hoth': 'होठ', 'hothon': 'होठों', 'chehra': 'चेहरा', 'roop': 'रूप', 'rang': 'रंग', 'zulf': 'ज़ुल्फ़', 'zulfein': 'ज़ुल्फ़ें',
  'saans': 'साँस', 'saansein': 'साँसें', 'saanson': 'साँसों', 'rooh': 'रूह', 'wajood': 'वजूद', 'vajood': 'वजूद',
  'dard': 'दर्द', 'gham': 'ग़म', 'aansu': 'आँसू', 'khushi': 'ख़ुशी', 'chain': 'चैन', 'sukoon': 'सुकून',
  'khwab': 'ख़्वाब', 'khwaab': 'ख़्वाब', 'sapna': 'सपना', 'sapne': 'सपने', 'sapno': 'सपनों',
  'yaad': 'याद', 'yaadein': 'यादें', 'yaadon': 'यादों', 'baat': 'बात', 'baatein': 'बातें', 'baaton': 'बातों',
  'fasle': 'फ़ासले', 'faasle': 'फ़ासले', 'doori': 'दूरी', 'dooriyan': 'दूरियाँ', 'door': 'दूर', 'paas': 'पास',
  'saath': 'साथ', 'safar': 'सफ़र', 'raah': 'राह', 'raahein': 'राहें', 'manzil': 'मंज़िल', 'humsafar': 'हमसफ़र',
  'khuda': 'ख़ुदा', 'rab': 'रब', 'rabb': 'रब', 'bhagwan': 'भगवान', 'dua': 'दुआ', 'ibadat': 'इबादत',
  'pal': 'पल', 'lamha': 'लम्हा', 'lamhe': 'लम्हे', 'waqt': 'वक़्त', 'zindagi': 'ज़िंदगी', 'jeevan': 'जीवन',
  'sirf': 'सिर्फ़', 'bas': 'बस', 'hamesha': 'हमेशा', 'kabhi': 'कभी', 'har': 'हर', 'ek': 'एक', 'do': 'दो',
  'pehle': 'पहले', 'pehla': 'पहला', 'pehli': 'पहली', 'aakhri': 'आख़िरी', 'naye': 'नए', 'nayi': 'नई', 'naya': 'नया',
  'purana': 'पुराना', 'purani': 'पुरानी', 'sacha': 'सच्चा', 'sachi': 'सच्ची', 'achha': 'अच्छा', 'achhi': 'अच्छी'
};

// General Phonetic Roman-to-Devanagari Transliteration Fallback
const PHONETIC_CONSONANTS = [
  ['kh', 'ख'], ['gh', 'घ'], ['chh', 'छ'], ['jh', 'झ'], ['th', 'थ'], ['dh', 'ध'],
  ['ph', 'फ'], ['bh', 'भ'], ['sh', 'श'], ['ch', 'च'], ['ng', 'ङ'],
  ['k', 'क'], ['g', 'ग'], ['j', 'ज'], ['t', 'त'], ['d', 'द'], ['n', 'न'],
  ['p', 'प'], ['b', 'ब'], ['m', 'म'], ['y', 'य'], ['r', 'र'], ['l', 'ल'],
  ['v', 'व'], ['w', 'व'], ['s', 'स'], ['h', 'ह'], ['z', 'ज़'], ['q', 'क़'],
  ['f', 'फ़'], ['x', 'क्स']
];

const PHONETIC_VOWELS = [
  ['aa', 'ा'], ['ee', 'ी'], ['oo', 'ू'], ['ai', 'ै'], ['au', 'ौ'],
  ['a', ''], ['i', 'ि'], ['u', 'ु'], ['e', 'े'], ['o', 'ो']
];

const INITIAL_VOWELS = [
  ['aa', 'आ'], ['ee', 'ई'], ['oo', 'ऊ'], ['ai', 'ऐ'], ['au', 'औ'],
  ['a', 'अ'], ['i', 'इ'], ['u', 'उ'], ['e', 'ए'], ['o', 'ओ']
];

function ruleBasedTransliterate(word) {
  if (!word) return '';
  let str = word.toLowerCase();
  let result = '';
  let i = 0;

  while (i < str.length) {
    // If at start or after vowel, check initial vowels
    if (i === 0) {
      let matchedVowel = false;
      for (const [rom, dev] of INITIAL_VOWELS) {
        if (str.startsWith(rom, i)) {
          result += dev;
          i += rom.length;
          matchedVowel = true;
          break;
        }
      }
      if (matchedVowel) continue;
    }

    // Match consonant
    let matchedConsonant = null;
    let consLen = 0;
    for (const [rom, dev] of PHONETIC_CONSONANTS) {
      if (str.startsWith(rom, i)) {
        matchedConsonant = dev;
        consLen = rom.length;
        break;
      }
    }

    if (matchedConsonant) {
      i += consLen;
      // Look ahead for vowel
      let matchedMatra = null;
      let matraLen = 0;
      for (const [rom, dev] of PHONETIC_VOWELS) {
        if (str.startsWith(rom, i)) {
          matchedMatra = dev;
          matraLen = rom.length;
          break;
        }
      }

      if (matchedMatra !== null) {
        result += matchedConsonant + matchedMatra;
        i += matraLen;
      } else {
        // End of word or consonant cluster: in Hindi last consonant usually has inherent 'a' deleted
        if (i >= str.length) {
          result += matchedConsonant;
        } else {
          // Half-consonant / conjunct
          result += matchedConsonant + '्';
        }
      }
    } else {
      // Unmatched character, keep as is
      result += str[i];
      i++;
    }
  }

  // Clean trailing halant
  return result.replace(/्$/, '');
}

function transliterateToken(token) {
  if (!token) return '';
  // Check if token has leading/trailing punctuation or timestamps
  const match = token.match(/^([^a-zA-Z]*)([a-zA-Z]+)([^a-zA-Z]*)$/);
  if (!match) return token;
  const prefix = match[1];
  const word = match[2].toLowerCase();
  const suffix = match[3];

  let dev = COMMON_HINDI_WORDS[word];
  if (!dev) {
    dev = ruleBasedTransliterate(word);
  }
  return prefix + dev + suffix;
}

function transliterateTextToDevanagari(text) {
  if (!text) return '';
  // If already predominantly Devanagari, return unmodified
  if (/[\u0900-\u097F]/.test(text) && !/[a-zA-Z]{4,}/.test(text)) {
    return text;
  }

  const lines = text.split('\n');
  return lines.map(line => {
    // Preserve LRC timestamp prefix [mm:ss.xx]
    const timeMatch = line.match(/^(\[\d{2}:\d{2}(?:\.\d{2,3})?\])(.*)$/);
    if (timeMatch) {
      const timePrefix = timeMatch[1];
      const rest = timeMatch[2];
      const transliteratedRest = rest.split(/(\s+)/).map(tok => {
        if (/^\s+$/.test(tok)) return tok;
        return transliterateToken(tok);
      }).join('');
      return timePrefix + transliteratedRest;
    }

    return line.split(/(\s+)/).map(tok => {
      if (/^\s+$/.test(tok)) return tok;
      return transliterateToken(tok);
    }).join('');
  }).join('\n');
}

function detectLyricsLanguage(text, trackTitle, artist, album) {
  const lyricsSample = (text || '').slice(0, 1500);
  const metadata = `${trackTitle || ''} ${artist || ''} ${album || ''}`.toLowerCase();

  // 1. Direct Script Detection from Lyrics Text
  if (/[\u0900-\u097F]/.test(lyricsSample)) {
    return { language: 'Hindi', script: 'Devanagari', code: 'hi', isNativeScript: true };
  }
  if (/[\u0A00-\u0A7F]/.test(lyricsSample)) {
    return { language: 'Punjabi', script: 'Gurmukhi', code: 'pa', isNativeScript: true };
  }
  if (/[\u0600-\u06FF]/.test(lyricsSample)) {
    return { language: 'Urdu', script: 'Urdu (Nastaliq)', code: 'ur', isNativeScript: true };
  }
  if (/[\uAC00-\uD7AF]/.test(lyricsSample)) {
    return { language: 'Korean', script: 'Hangul', code: 'ko', isNativeScript: true };
  }
  if (/[\u3040-\u30FF\u4E00-\u9FAF]/.test(lyricsSample)) {
    return { language: 'Japanese', script: 'Kanji/Kana', code: 'ja', isNativeScript: true };
  }
  if (/[\u0B80-\u0BFF]/.test(lyricsSample)) {
    return { language: 'Tamil', script: 'Tamil', code: 'ta', isNativeScript: true };
  }
  if (/[\u0C00-\u0C7F]/.test(lyricsSample)) {
    return { language: 'Telugu', script: 'Telugu', code: 'te', isNativeScript: true };
  }

  // 2. Cultural & Artist Detection when Lyrics are Romanized
  const punjabiArtists = ['diljit', 'sidhu moose', 'ap dhillon', 'karan aujla', 'guru randhawa', 'amrinder gill', 'shubh', 'honey singh', 'garry sandhu', 'ammy virk', 'b praak', 'hardy sandhu', 'jasleen', 'mankirt', 'jassi', 'prophec', 'parmish', 'sidhu'];
  const punjabiKeywords = ['jatt', 'pyaar', 'mittran', 'gabru', 'kudi', 'munde', 'sohneya', 'soch', 'nach', 'gaddi', 'dooron', 'ishqan', 'chann', 'akhiyan', 'laung', 'daang', 'tere naal'];
  if (punjabiArtists.some(a => metadata.includes(a)) || punjabiKeywords.some(k => metadata.includes(k))) {
    return { language: 'Punjabi', script: 'Latin', code: 'pa', isNativeScript: false };
  }

  const urduArtists = ['atif aslam', 'nusrat fateh', 'rahat fateh', 'ghulam ali', 'mehdi hassan', 'ali zafar', 'kaifi khalil', 'abida parveen', 'sajjad ali', 'ali sethi', 'shae gill', 'fuzon', 'jal', 'farhan saeed', 'bilal saeed', 'asim azhar'];
  const urduKeywords = ['humsafar', 'kahani suno', 'afreen', 'sukoon', 'khamoshi', 'ishq', 'dastaan', 'faasle', 'aadat', 'tajdar', 'habibi', 'rooh', 'wajood'];
  if (urduArtists.some(a => metadata.includes(a)) || urduKeywords.some(k => metadata.includes(k))) {
    return { language: 'Urdu', script: 'Latin', code: 'ur', isNativeScript: false };
  }

  const hindiArtists = ['arijit', 'shreya ghoshal', 'kishore kumar', 'lata mangeshkar', 'amit trivedi', 'kk', 'sonu nigam', 'neha kakkar', 'badshah', 'jubin nautiyal', 'alka yagnik', 'kumar sanu', 'udit narayan', 'armaan malik', 'darshan raval', 'pritam', 'ar rahman', 'vishal-shekhar', 'sachin-jigar', 'himesh', 'mohit chauhan', 'sunidhi chauhan', 'shaan', 'anuv jain', 'badshah', 'armaan'];
  const hindiKeywords = ['tum', 'dil', 'pyar', 'zindagi', 'mohabbat', 'khuda', 'saath', 'meri', 'hum', 'tere', 'mera', 'raat', 'sanam', 'aankhon', 'chaha', 'kaha', 'dhadkan', 'kesariya', 'muskurane', 'channa', 'shayad', 'bekhayali', 'kalank', 'raataan', 'baatein', 'deewana', 'khairiyat', 'gehraiyaan'];
  if (hindiArtists.some(a => metadata.includes(a)) || hindiKeywords.some(k => metadata.includes(k))) {
    return { language: 'Hindi', script: 'Latin', code: 'hi', isNativeScript: false, canTransliterate: true };
  }

  const spanishArtists = ['bad bunny', 'rosalía', 'enrique iglesias', 'j balvin', 'daddy yankee', 'maluma', 'shakira', 'luis fonsi', 'ozuna', 'karol g'];
  const spanishKeywords = ['amor', 'corazon', 'noche', 'vida', 'bailando', 'senorita', 'despacito', 'ella', 'mi gente'];
  if (spanishArtists.some(a => metadata.includes(a)) || spanishKeywords.some(k => metadata.includes(k))) {
    return { language: 'Spanish', script: 'Latin', code: 'es', isNativeScript: true };
  }

  return { language: 'English', script: 'Latin', code: 'en', isNativeScript: true };
}

module.exports = {
  transliterateTextToDevanagari,
  detectLyricsLanguage,
  COMMON_HINDI_WORDS
};
