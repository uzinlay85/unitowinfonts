/**
 * Myanmar Font Converter Engine
 * Specialized for Win Researcher <-> Pyidaungsu (Unicode)
 * With Smart English Preservation and Mixed Script Intelligence
 */

// Initialize global debug dummy for ThanLwinSoft engine
if (typeof TlsDebug === 'undefined') {
    function TlsDebug() {
        this.DEBUG = 0;
        this.dbgMsg = function() {};
        this.print = function() {};
    }
    if (typeof window !== 'undefined') window.TlsDebug = TlsDebug;
    if (typeof global !== 'undefined') global.TlsDebug = TlsDebug;
}

const MM_CONVERTER = (function() {
    let tlsConv = null;
    
    function getConverter() {
        if (!tlsConv) {
            const root = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
            const converters = root.tlsMyanmarConverters || (typeof tlsMyanmarConverters !== 'undefined' ? tlsMyanmarConverters : null);
            if (converters) {
                if (converters['win researcher']) {
                    tlsConv = converters['win researcher'];
                } else if (converters['wininnwa']) {
                    tlsConv = converters['wininnwa'];
                }
            }
        }
        if (tlsConv && (!tlsConv.debug || typeof tlsConv.debug.dbgMsg !== 'function')) {
            tlsConv.debug = {
                DEBUG: 0,
                dbgMsg: function() {},
                print: function() {}
            };
        }
        return tlsConv;
    }

    // Characters exclusive to WinInnwa/Win Researcher or never present inside pure English words
    const WIN_CHARS = /[\u0080-\u00FF;&*_~>?'\"\u2018\u2019\u201C\u201D\/]/;
    
    // Standard Myanmar Unicode character range
    const MYANMAR_UNICODE_REGEX = /[\u1000-\u109F\uAA60-\uAA7F\uA9E0-\uA9FE]/;
    const MYANMAR_UNICODE_BLOCK = /([\u1000-\u109F\uAA60-\uAA7F\uA9E0-\uA9FE]+)/g;

    const DIGIT_WIN_TO_UNI = {
        '0': '၀', '1': '၁', '2': '၂', '3': '၃', '4': '၄',
        '5': '၅', '6': '၆', '7': '၇', '8': '၈', '9': '၉'
    };

    const DIGIT_UNI_TO_WIN = {
        '၀': '0', '၁': '1', '၂': '2', '၃': '3', '၄': '4',
        '၅': '5', '၆': '6', '၇': '7', '၈': '8', '၉': '9'
    };

    const COMMON_2LETTER_ENG = new Set([
        'to', 'in', 'is', 'it', 'as', 'at', 'be', 'by', 'he', 'me', 'my',
        'no', 'of', 'on', 'or', 'so', 'up', 'we', 'do', 'go', 'if', 'us',
        'am', 'an', 'dr', 'mr', 'ms', 'ok'
    ]);

    function hasEnglishWord(word) {
        const root = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
        const dict = root.ENG_DICT || (typeof ENG_DICT !== 'undefined' ? ENG_DICT : null);
        return dict ? dict.has(word) : false;
    }

    /**
     * Determine if a raw token from Win Researcher text is English
     */
    function isEnglishToken(rawToken, options = {}) {
        if (!rawToken || !rawToken.trim()) return false;
        const token = rawToken.trim();

        // Check custom overrides
        if (options.manualEnglish && options.manualEnglish.has(token)) return true;
        if (options.manualMyanmar && options.manualMyanmar.has(token)) return false;

        // Never treat Win Researcher special standalone Burmese character sequences as English
        const WIN_BURMESE_EXACT_CODES = new Set(['Mo', 'OD', 'OD;', 'tHhMo', 'Mo;', 'aMomf', 'aMomf;', 'Adkvf']);
        if (WIN_BURMESE_EXACT_CODES.has(token) || WIN_BURMESE_EXACT_CODES.has(token.replace(/^[^\w]+|[^\w]+$/g, ''))) return false;

        // 1. Explicit URLs, emails
        if (/^(https?:\/\/|www\.)/i.test(token)) return true;
        if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(token)) return true;

        // 2. Formatted numbers / codes: phone numbers, dates, version numbers, currency, comma-separated numbers
        // e.g., 09-123456789, +959..., 12/04/2026, 10:30AM, $100, 50%, v1.2.0, 1990-2025, 10,000, 1,000,000
        if (/^[\+\$]?\d{1,3}(,\d{3})+(\.\d+)?%?$/.test(token)) return true;
        if (/^[\+\$]?\d+([-\/\.:]\d+)+%?$/i.test(token)) return true;
        if (/^\$\d+(\.\d+)?$/.test(token)) return true;
        if (/^\d+(\.\d+)?%$/.test(token)) return true;

        // 3. If token contains any Win legacy extended characters or internal Win symbols, it's 100% Burmese!
        if (WIN_CHARS.test(token)) return false;

        // 4. Strip English outer punctuation: "Hello," -> "Hello"
        const match = token.match(/^([^\w]*)([\w\-\'\.]+?)([^\w]*)$/);
        if (!match) return false;
        const clean = match[2];

        // 5. If it contains uppercase letter after lowercase (e.g. avS, aywH, vQyf, uRefawmf)
        // Check if it's a recognized CamelCase brand first
        const KNOWN_CAMEL = new Set([
            'iphone', 'ipad', 'ipod', 'imac', 'ios', 'macos', 'youtube', 'wifi',
            'powerpoint', 'whatsapp', 'linkedin', 'github', 'gitlab', 'tiktok',
            'paypal', 'ebay', 'playstation', 'xbox', 'javascript', 'typescript',
            'wordpress', 'fedex', 'mcdonalds'
        ]);
        if (/[a-z]+[A-Z]/.test(clean)) {
            if (clean.length >= 4 && (KNOWN_CAMEL.has(clean.toLowerCase()) || hasEnglishWord(clean.toLowerCase()))) {
                return true;
            }
            return false;
        }

        // 6. ALL-CAPS acronyms: only recognized acronyms or valid English words
        const COMMON_ACRONYMS = new Set([
            'PDF', 'RAM', 'CPU', 'USA', 'UK', 'US', 'COVID', 'WHO', 'UN', 'NGO',
            'USD', 'MMK', 'KBZ', 'AYA', 'CB', 'UAB', 'MAB', 'AI', 'IT', 'URL',
            'HTML', 'CSS', 'JS', 'API', 'SIM', 'WIFI', 'GB', 'MB', 'KB', 'TB',
            'TV', 'FM', 'AM', 'PM', 'VIP', 'CEO', 'CFO', 'CTO', 'MD', 'HR',
            'QC', 'QA', 'SOS', 'FAQ', 'NRC', 'ID', 'NO', 'PH', 'TEL', 'FAX',
            'APP', 'SMS', 'OTP', 'ATM', 'POS', 'ISO', 'GMP', 'FDA', 'UNICEF'
        ]);
        if (/^[A-Z0-9]{2,}$/.test(clean)) {
            if (COMMON_ACRONYMS.has(clean) || hasEnglishWord(clean.toLowerCase())) {
                return true;
            }
            return false;
        }

        // 7. TitleCase words (Length >= 2): English, Computer, Science, John, Yangon, Mandalay, Ministry
        if (/^[A-Z][a-z]{1,}$/.test(clean)) {
            const lower = clean.toLowerCase();
            if (hasEnglishWord(lower)) return true;
            return false;
        }

        const lower = clean.toLowerCase();
        if (lower.length === 1) {
            // Standalone 'a' or 'i' in English is only English if surrounded by spaces and other English words.
            // In WinInnwa, standalone 'a' is 'ေ' (very common typo/part).
            return false;
        }

        // Two-letter English words
        if (lower.length === 2) {
            return COMMON_2LETTER_ENG.has(lower);
        }

        // 9. Check against 20,000+ English word dictionary
        if (hasEnglishWord(lower)) {
            return true;
        }

        // 10. Common English grammatical suffixes
        if (/^[a-z]+(ing|tion|sion|ment|ness|able|ible|ed|ly|est|er|ful|less|ize|ise)$/i.test(clean)) {
            return true;
        }

        return false;
    }

    /**
     * Convert Win Researcher text to Pyidaungsu (Unicode)
     */
    function winToUnicode(text, options = {}) {
        const conv = getConverter();
        if (!conv) throw new Error("Converter engine not initialized!");

        const detectEnglish = options.detectEnglish !== false;
        const numberMode = options.numberMode || 'auto'; // 'auto', 'myanmar', 'latin'

        // 1. Extract protected [en]...[/en] or <en>...</en> tags
        const protectedSegments = [];
        let processed = text.replace(/(\[en\]([\s\S]*?)\[\/en\]|<en>([\s\S]*?)<\/en>)/gi, (m, all, p1, p2) => {
            const idx = protectedSegments.length;
            protectedSegments.push(p1 || p2 || '');
            return `___EN_TAG_${idx}___`;
        });

        // Split by whitespace while preserving all spaces and line breaks
        const rawTokens = processed.split(/(\s+)/);
        const tokenDetails = [];
        let result = '';

        let englishWordCount = 0;
        let myanmarWordCount = 0;

        for (let rawToken of rawTokens) {
            if (!rawToken) continue;

            // Whitespace passes through unmodified
            if (/^\s+$/.test(rawToken)) {
                result += rawToken;
                continue;
            }

            // Check for explicit protected tag
            const tagMatch = rawToken.match(/___EN_TAG_(\d+)___/);
            if (tagMatch) {
                const idx = parseInt(tagMatch[1]);
                const protectedText = protectedSegments[idx];
                const replaced = rawToken.replace(`___EN_TAG_${idx}___`, protectedText);
                result += replaced;
                tokenDetails.push({
                    original: replaced,
                    converted: replaced,
                    isEnglish: true,
                    explicit: true
                });
                englishWordCount++;
                continue;
            }

            // Test if token is English
            const isEng = detectEnglish && isEnglishToken(rawToken, options);

            if (isEng) {
                let convertedToken = rawToken;
                // If number mode is strictly 'myanmar', convert digits even in English tokens if requested
                if (numberMode === 'myanmar') {
                    convertedToken = convertedToken.replace(/[0-9]/g, d => DIGIT_WIN_TO_UNI[d] || d);
                }
                result += convertedToken;
                tokenDetails.push({
                    original: rawToken,
                    converted: convertedToken,
                    isEnglish: true
                });
                englishWordCount++;
            } else {
                // Convert via Win Researcher -> Unicode
                let converted = conv.convertToUnicode(rawToken);

                // Apply digit preferences for Myanmar text
                if (numberMode === 'latin') {
                    converted = converted.replace(/[၀-၉]/g, d => DIGIT_UNI_TO_WIN[d] || d);
                }

                result += converted;
                tokenDetails.push({
                    original: rawToken,
                    converted: converted,
                    isEnglish: false
                });
                myanmarWordCount++;
            }
        }

        return {
            text: result,
            tokens: tokenDetails,
            stats: {
                totalLength: result.length,
                englishWords: englishWordCount,
                myanmarWords: myanmarWordCount
            }
        };
    }

    /**
     * Convert Pyidaungsu (Unicode) to Win Researcher
     */
    function unicodeToWin(text, options = {}) {
        const conv = getConverter();
        if (!conv) throw new Error("Converter engine not initialized!");

        const preserveEnglish = options.preserveEnglish !== false;
        const numberMode = options.numberMode || 'auto'; // 'auto', 'myanmar', 'latin'
        const smartPunctuation = options.smartPunctuation !== false; // true by default

        let processedText = text || '';

        // Normalize commas and periods attached to Myanmar text so they become Myanmar punctuation
        // and do NOT convert to the Win consonant 'ယ'
        if (smartPunctuation) {
            const MM_CHAR = '[\\u1000-\\u109F\\uAA60-\\uAA7F\\uA9E0-\\uA9FE]';
            // Comma preceded by Myanmar character (e.g. လည်းကောင်း, -> လည်းကောင်း၊)
            processedText = processedText.replace(new RegExp(`(${MM_CHAR})\\s*,`, 'g'), '$1၊');
            // Comma followed by Myanmar character (e.g. , မြန်မာ -> ၊ မြန်မာ)
            processedText = processedText.replace(new RegExp(`,\\s*(${MM_CHAR})`, 'g'), '၊ $1');
            // Period preceded by Myanmar character (e.g. သည်. -> သည်။)
            processedText = processedText.replace(new RegExp(`(${MM_CHAR})\\s*\\.(?!\\w)`, 'g'), '$1။');
        }

        // Split into Myanmar Unicode segments and Non-Myanmar segments
        const segments = [];
        let lastIdx = 0;
        let match;
        MYANMAR_UNICODE_BLOCK.lastIndex = 0;

        while ((match = MYANMAR_UNICODE_BLOCK.exec(processedText)) !== null) {
            if (match.index > lastIdx) {
                segments.push({
                    type: 'non-myanmar',
                    text: processedText.substring(lastIdx, match.index)
                });
            }
            segments.push({
                type: 'myanmar',
                text: match[1]
            });
            lastIdx = MYANMAR_UNICODE_BLOCK.lastIndex;
        }
        if (lastIdx < processedText.length) {
            segments.push({
                type: 'non-myanmar',
                text: processedText.substring(lastIdx)
            });
        }

        let plainText = '';
        let htmlText = '';
        let englishWordCount = 0;
        let myanmarWordCount = 0;

        for (const seg of segments) {
            if (seg.type === 'myanmar') {
                let converted = conv.convertFromUnicode(seg.text);

                if (numberMode === 'latin') {
                    // In WinInnwa, digits 0-9 are used for Burmese numbers.
                    // If Latin digits are explicitly desired, keep as is.
                }

                plainText += converted;
                htmlText += `<span class="font-win" style="font-family:'Win Researcher', WinInnwa, sans-serif;">${escapeHtml(converted)}</span>`;
                myanmarWordCount++;
            } else {
                let englishContent = seg.text;
                plainText += englishContent;
                htmlText += `<span class="font-eng" style="font-family:'Times New Roman', 'Inter', sans-serif;">${escapeHtml(englishContent)}</span>`;
                if (englishContent.trim().length > 0) {
                    englishWordCount++;
                }
            }
        }

        return {
            plainText: plainText,
            htmlText: htmlText,
            segments: segments,
            stats: {
                totalLength: plainText.length,
                englishSegments: englishWordCount,
                myanmarSegments: myanmarWordCount
            }
        };
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    return {
        winToUnicode,
        unicodeToWin,
        isEnglishToken,
        getConverter
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MM_CONVERTER;
}
if (typeof window !== 'undefined') {
    window.MM_CONVERTER = MM_CONVERTER;
}
