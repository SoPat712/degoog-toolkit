// Explicit dated supplements: never extrapolate a lunar festival by month/day.
// India 2026: https://cag.gov.in/defence/new-delhi/en/page-defence-new-delhi-holidaylist
// US national Arbor Day: https://www.arborday.org/celebrate
export const supplementalHolidays = [
  { calendar: "US", name: "Arbor Day", rule: "friday before 05-01" },
  // https://www.gob.mx/inafed/articulos/dia-de-muertos-tradicion-mexicana-que-trasciende-en-el-tiempo?os=a
  { calendar: "MX", name: "Day of the Dead", rule: "11-01 P2D" },
  ...Object.entries({
    "Holi": "03-04", "Ram Navami": "03-26", "Mahavir Jayanti": "03-31",
    "Buddha Purnima": "05-01", "Janmashtami": "09-04", "Dussehra": "10-20",
    "Deepavali": "11-08", "Guru Nanak's Birthday": "11-24",
    "Makar Sankranti": "01-14", "Pongal": "01-14", "Basant Panchami": "01-23",
    "Maha Shivratri": "02-15", "Holika Dahan": "03-03", "Ugadi": "03-19",
    "Gudi Padwa": "03-19", "Cheti Chand": "03-19", "Vaisakhi": "04-14", "Vishu": "04-14",
    "Onam": "08-26", "Raksha Bandhan": "08-28", "Ganesh Chaturthi": "09-14",
    "Karwa Chauth": "10-29", "Govardhan Puja": "11-09", "Bhai Duj": "11-11",
    "Chhath Puja": "11-15",
  }).map(([name, date]) => ({ calendar: "IN", name, rule: `2026-${date}` })),
  // Actual festival dates, not the multi-day court recess:
  // https://cdnbbsr.s3waas.gov.in/s3ec0490f1f4972d133619a60c30f3559e/uploads/2026/09/2026090138.pdf
  ...Object.entries({
    "Makar Sankranti": "01-14", "Pongal": "01-15", "Guru Gobind Singh's Birthday": "01-15",
    "Holi": "03-23", "Ram Navami": "04-15", "Mahavir Jayanti": "04-19",
    "Buddha Purnima": "05-20", "Raksha Bandhan": "08-17", "Janmashtami": "08-25",
    "Dussehra": "10-09", "Deepavali": "10-29", "Guru Nanak's Birthday": "11-14",
  }).map(([name, date]) => ({ calendar: "IN", name, rule: `2027-${date}` })),
  // https://www.timeanddate.com/holidays/india/ganesh-chaturthi
  { calendar: "IN", name: "Ganesh Chaturthi", rule: "2027-09-04" },
  // Additional regional observances from the calendar publisher:
  // https://www.timeanddate.com/holidays/india/2027
  ...Object.entries({
    "Basant Panchami": "02-11", "Maha Shivratri": "03-06", "Holika Dahan": "03-22",
    "Ugadi": "04-07", "Gudi Padwa": "04-07", "Cheti Chand": "04-07",
    "Vaisakhi": "04-14", "Vishu": "04-14", "Rath Yatra": "07-05", "Onam": "09-12",
    "Karwa Chauth": "10-18", "Govardhan Puja": "10-30", "Bhai Duj": "10-31", "Chhath Puja": "11-04",
  }).map(([name, date]) => ({ calendar: "IN", name, rule: `2027-${date}` })),
];

// Official correction published after the upstream data was compiled.
// https://pmo.govmu.org/CabinetDecision/2026/Highlights%20of%20Cabinet%20Meeting%20%20Friday%20%2022%20May%202026.pdf
export const correctedDates = { "MU|Ganesh Chaturthi|2026": "2026-09-15" };
