export function normalizeHolidayName(value) {
  return String(value || "").normalize("NFKD").replace(/\p{M}/gu, "")
    .toLowerCase().replace(/['’]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Explicit spelling/transliteration aliases, not fuzzy substring matching.
export const holidayAliases = [
  ["Christmas Day", "Christmas", "Xmas"],
  ["New Year's Day", "New Year", "New Years"],
  ["Valentine's Day", "Valentine Day", "Valentines"],
  ["Easter Sunday", "Easter"],
  ["Thanksgiving Day", "Thanksgiving"],
  ["Labour Day", "Labor Day"],
  ["Hanukkah", "Hannukah", "Hanukah", "Chanukah", "Chanukkah"],
  ["Deepavali", "Diwali", "Divali"],
  ["Ganesh Chaturthi", "Ganesh Chaturti", "Ganesha Chaturthi", "Vinayaka Chaturthi", "Vinayagar Chathurthi"],
  ["Chinese New Year", "Chinese Spring Festival", "Lunar New Year"],
  ["Eid al-Fitr", "Eid ul-Fitr", "Id-ul-Fitr", "Eid-Ul-Fitr"],
  ["Eid al-Adha", "Eid ul-Adha", "Id-ul-Zuha", "Bakrid"],
  ["Rosh Hashanah", "Rosh Hashana"],
  ["Vesak", "Vesak Day", "Buddha Purnima", "Budha Purnima"],
  ["Maha Shivaratri", "Maha Shivratri", "Maha Shivaratree"],
  ["Basant Panchami", "Vasant Panchami"],
  ["Ram Navami", "Rama Navami"],
  ["Guru Nanak's Birthday", "Guru Nanak Jayanti", "Gurpurab"],
  ["Guru Gobind Singh's Birthday", "Guru Gobind Singh Jayanti", "Guru Govind Singh Jayanti"],
  ["Chhath Puja", "Chhat Puja"],
  ["Vaisakhi", "Baisakhi"],
  ["Dussehra", "Dasara", "Vijayadashami"],
  ["Nowruz", "Norooz", "Nowrouz", "Navroz"],
  ["St. Patrick's Day", "Saint Patrick's Day", "St Patricks Day"],
  ["Dia de los Muertos", "Día de Muertos", "Day of the Dead"],
];
