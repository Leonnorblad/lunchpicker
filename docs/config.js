// Inställningar för sidan. Rösterna sparas som räknare hos Abacus (ingen nyckel behövs).
// Byt namespace om du vill börja om från noll.
window.LUNCH = {
  counterApi: "https://abacus.jasoncameron.dev",
  namespace: "ulriksdal-lunch-3n17fuma",
  // Röstningen öppnar när rutinen har läst in dagens menyer (strax före 10), eller senast
  // voteOpens om inläsningen inte blev av. Då visas länkar till restaurangernas egna menyer.
  voteOpens: "10:30",
  spinAt: "11:30",
  // Statistiksidan (knappen uppe till höger och statistik.html). Rösterna arkiveras
  // varje morgon oavsett, så allt finns med när den slås på.
  showStats: false,
};
