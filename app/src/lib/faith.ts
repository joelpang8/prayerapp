/**
 * Choices for the profile's "Bible version I read" and "Denomination".
 * Both also allow "Other" with the person's own words. These are just labels
 * people pick for their profile; they don't affect which translation the app
 * shows verses in (that's Settings > Bible translation).
 */

/** Stored as the abbreviation (fits the 40-character limit); shown with the full name. */
export const BIBLE_VERSIONS: { abbr: string; name: string }[] = [
  { abbr: "KJV", name: "King James Version" },
  { abbr: "NKJV", name: "New King James Version" },
  { abbr: "ESV", name: "English Standard Version" },
  { abbr: "NIV", name: "New International Version" },
  { abbr: "NLT", name: "New Living Translation" },
  { abbr: "NASB", name: "New American Standard Bible" },
  { abbr: "LSB", name: "Legacy Standard Bible" },
  { abbr: "CSB", name: "Christian Standard Bible" },
  { abbr: "NRSV", name: "New Revised Standard Version" },
  { abbr: "NRSVue", name: "NRSV Updated Edition" },
  { abbr: "RSV", name: "Revised Standard Version" },
  { abbr: "RSV-CE", name: "RSV Catholic Edition" },
  { abbr: "NABRE", name: "New American Bible, Revised Edition" },
  { abbr: "NJB", name: "New Jerusalem Bible" },
  { abbr: "DRA", name: "Douay-Rheims" },
  { abbr: "AMP", name: "Amplified Bible" },
  { abbr: "MSG", name: "The Message" },
  { abbr: "NET", name: "New English Translation" },
  { abbr: "CEB", name: "Common English Bible" },
  { abbr: "CEV", name: "Contemporary English Version" },
  { abbr: "GNT", name: "Good News Translation" },
  { abbr: "ERV", name: "Easy-to-Read Version" },
  { abbr: "NCV", name: "New Century Version" },
  { abbr: "TLB", name: "The Living Bible" },
  { abbr: "TPT", name: "The Passion Translation" },
  { abbr: "ASV", name: "American Standard Version" },
  { abbr: "WEB", name: "World English Bible" },
  { abbr: "YLT", name: "Young's Literal Translation" },
];

export function bibleVersionLabel(value: string): string {
  const v = BIBLE_VERSIONS.find((b) => b.abbr === value);
  return v ? `${v.name} (${v.abbr})` : value;
}

/** Common Christian traditions, roughly grouped; "Other" covers the rest. */
export const DENOMINATIONS: string[] = [
  "Non-denominational",
  "Catholic",
  "Eastern Orthodox",
  "Oriental Orthodox",
  "Anglican",
  "Episcopal",
  "Lutheran",
  "Presbyterian",
  "Reformed",
  "Methodist",
  "Wesleyan",
  "Baptist",
  "Southern Baptist",
  "Pentecostal",
  "Assemblies of God",
  "Charismatic",
  "Church of God",
  "Church of the Nazarene",
  "Seventh-day Adventist",
  "Church of Christ",
  "Disciples of Christ",
  "Congregational",
  "Evangelical Free",
  "Evangelical Covenant",
  "Christian and Missionary Alliance",
  "Calvary Chapel",
  "Vineyard",
  "Mennonite",
  "Anabaptist",
  "Quaker (Friends)",
  "Moravian",
  "Salvation Army",
  "Messianic",
];
