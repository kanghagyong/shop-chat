require('dotenv').config();

const DEEPL_API_URL = 'https://api-free.deepl.com/v2/translate';

// Our internal codes -> DeepL target_lang. Languages not in this map
// (e.g. vi, th) are not supported by DeepL and are skipped.
const DEEPL_TARGET_LANG = {
  ko: 'KO',
  en: 'EN-US',
  ja: 'JA',
  zh: 'ZH',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
};

async function translateMessage(text, targetLanguageCode) {
  const targetLang = DEEPL_TARGET_LANG[targetLanguageCode];
  if (!targetLang) {
    return { detectedLanguage: null, translatedText: null };
  }

  const response = await fetch(DEEPL_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      target_lang: targetLang,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`DeepL API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const translation = data.translations[0];
  const detectedLanguage = translation.detected_source_language.toLowerCase();

  return {
    detectedLanguage,
    translatedText: detectedLanguage === targetLanguageCode ? null : translation.text,
  };
}

module.exports = { translateMessage };
