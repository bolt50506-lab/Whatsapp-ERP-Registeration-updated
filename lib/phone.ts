const COUNTRY_CODES: Record<string, { dialCode: string; name: string }> = {
  PK: { dialCode: '92', name: 'Pakistan' },
  IN: { dialCode: '91', name: 'India' },
  BD: { dialCode: '880', name: 'Bangladesh' },
  SA: { dialCode: '966', name: 'Saudi Arabia' },
  AE: { dialCode: '971', name: 'UAE' },
  GB: { dialCode: '44', name: 'United Kingdom' },
  US: { dialCode: '1', name: 'United States' },
  MY: { dialCode: '60', name: 'Malaysia' },
  ID: { dialCode: '62', name: 'Indonesia' },
  EG: { dialCode: '20', name: 'Egypt' },
  NG: { dialCode: '234', name: 'Nigeria' },
  TR: { dialCode: '90', name: 'Turkey' },
  QA: { dialCode: '974', name: 'Qatar' },
  KW: { dialCode: '965', name: 'Kuwait' },
  OM: { dialCode: '968', name: 'Oman' },
  BH: { dialCode: '973', name: 'Bahrain' },
  LK: { dialCode: '94', name: 'Sri Lanka' },
  NP: { dialCode: '977', name: 'Nepal' },
  AF: { dialCode: '93', name: 'Afghanistan' },
  IR: { dialCode: '98', name: 'Iran' },
  IQ: { dialCode: '964', name: 'Iraq' },
  JO: { dialCode: '962', name: 'Jordan' },
  LB: { dialCode: '961', name: 'Lebanon' },
  SY: { dialCode: '963', name: 'Syria' },
  YE: { dialCode: '967', name: 'Yemen' },
  PS: { dialCode: '970', name: 'Palestine' },
  DZ: { dialCode: '213', name: 'Algeria' },
  MA: { dialCode: '212', name: 'Morocco' },
  TN: { dialCode: '216', name: 'Tunisia' },
  LY: { dialCode: '218', name: 'Libya' },
  SD: { dialCode: '249', name: 'Sudan' },
  KE: { dialCode: '254', name: 'Kenya' },
  ET: { dialCode: '251', name: 'Ethiopia' },
  GH: { dialCode: '233', name: 'Ghana' },
  TZ: { dialCode: '255', name: 'Tanzania' },
  UG: { dialCode: '256', name: 'Uganda' },
};

export function getCountryList() {
  return Object.entries(COUNTRY_CODES).map(([code, info]) => ({
    code,
    dialCode: info.dialCode,
    name: info.name,
  }));
}

export function normalizePhone(input: string, defaultCountry = 'PK'): string {
  let cleaned = input.trim().replace(/[\s\-()]/g, '');

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  if (cleaned.startsWith('00')) {
    return '+' + cleaned.substring(2);
  }

  const country = COUNTRY_CODES[defaultCountry];
  if (!country) return cleaned;

  if (cleaned.startsWith('0')) {
    return '+' + country.dialCode + cleaned.substring(1);
  }

  if (cleaned.startsWith(country.dialCode)) {
    return '+' + cleaned;
  }

  if (cleaned.length >= 9 && cleaned.length <= 15) {
    return '+' + country.dialCode + cleaned;
  }

  return cleaned;
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

export function isWhatsAppCompatible(phone: string): boolean {
  return isValidE164(phone);
}
