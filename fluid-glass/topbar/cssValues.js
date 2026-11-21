const FONT_WEIGHT_KEYWORDS = new Set(['normal', 'bold', 'bolder', 'lighter']);

export function sanitizeFontFamily(value) {
    const family = String(value ?? '').trim();
    return /^[\p{L}\p{N} ._'-]{1,64}$/u.test(family) ? family : '';
}

export function sanitizeFontWeight(value) {
    const weight = String(value ?? '').trim().toLowerCase();
    if (FONT_WEIGHT_KEYWORDS.has(weight))
        return weight;
    return /^[1-9]00$/.test(weight) ? weight : '';
}
