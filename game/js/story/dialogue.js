// Dialogue: the story of Selara Bay. Kai Santoso comes home after five
// years to find the Black Orchid syndicate running his island, and takes
// it back one job at a time. Lines are shown by the cutscene player with
// a portrait card and a subtitle.
export const SPEAKERS = {
  kai: { name: 'Kai', skin: '#c98d64', hair: '#1a1210', hairStyle: 'short', jacket: '#0d8a8a' },
  lin: { name: 'Mama Lin', skin: '#c98d64', hair: '#8a8a8a', hairStyle: 'bun', jacket: '#6b6b6b' },
  dex: { name: 'Dex', skin: '#8a5a3b', hair: '#0d0d0d', hairStyle: 'curly', jacket: '#3f6fb5' },
  viktor: { name: 'Viktor Raza', skin: '#d9a986', hair: '#2a2a2a', hairStyle: 'short', jacket: '#e8e8e8' },
  rendy: { name: 'Rendy', skin: '#c98d64', hair: '#1a1210', hairStyle: 'short', jacket: '#8a2be2' },
  narrator: { name: '', skin: '#888', hair: '#888', hairStyle: 'short', jacket: '#888' },
};

export const DIALOGUE = {
  'm1-intro': [
    { s: 'narrator', t: 'Five years away. Same salt air. Same broken promises.' },
    { s: 'kai', t: 'Selara Bay. I swore I would never come back. Then the Orchid took everything I had left.' },
  ],
  'm1-meet-lin': [
    { s: 'lin', t: 'Kai Santoso. You got taller. Or the island got smaller.' },
    { s: 'kai', t: 'Mama Lin. You still fix everything that rolls?' },
    { s: 'lin', t: 'Everything except you. The Orchid took your garage, your name, everything. Viktor Raza runs this town now.' },
    { s: 'kai', t: 'Then I will take it back. One job at a time.' },
    { s: 'lin', t: 'The safehouse is yours, sayang. Start small. And Kai — watch the yellow cars. Rendy loves yellow.' },
  ],
  'm2-intro': [
    { s: 'lin', t: 'Rendy — Viktor’s nephew — parks his yellow Vesper downtown like he owns the street. Take it. Bring it to me in one piece.' },
    { s: 'kai', t: 'Steal a car in broad daylight. Just like old times.' },
  ],
  'm2-done': [
    { s: 'lin', t: 'Not bad. A little scratched, but the engine sings. Here — a Kobra 9. You will need it where we are going.' },
  ],
  'm3-intro': [
    { s: 'lin', t: 'The Kedai Orchid owes me protection money. Four of Viktor’s enforcers are collecting it for themselves. Go collect it back.' },
    { s: 'kai', t: 'Four enforcers. One Kai. Fair fight.' },
  ],
  'm3-done': [
    { s: 'lin', t: 'Five hundred. The kedai stays open, and the island hears about it. The Orchid will not like that.' },
  ],
  'm4-intro': [
    { s: 'dex', t: 'Kai! Mama Lin said you were back. I need wheels — the Bank Samudra vault, fifteen seconds, in and out.' },
    { s: 'kai', t: 'Fifteen seconds inside a bank while the whole island watches. What could go wrong?' },
    { s: 'dex', t: 'Everything. That is why I need the best wheelman on the island. Drive, Kai. Drive.' },
  ],
  'm4-bank': [
    { s: 'dex', t: 'Keep the engine running. Fifteen seconds. Do not move.' },
  ],
  'm4-done': [
    { s: 'dex', t: 'We are clear. You drive like the island is on fire, Kai. I owe you one.' },
  ],
  'm5-intro': [
    { s: 'lin', t: 'Orchid Freight, Pier 9. Viktor moves his product through there at night. Six guards. One truck full of it. Burn the truck, Kai.' },
    { s: 'kai', t: 'Night work. Good. The dark is the only friend I have left on this island.' },
  ],
  'm5-done': [
    { s: 'lin', t: 'The whole docks saw that fire. Viktor knows your name now, Kai. He is scared. Scared men make mistakes.' },
  ],
  'm6-intro': [
    { s: 'viktor', t: 'You cost me a garage, a car, a bank and a truck, Santoso. Enjoy it. I am leaving on the morning boat, and this island forgets you.' },
    { s: 'kai', t: 'Not this morning, Viktor. Not ever.' },
  ],
  'm6-boss': [
    { s: 'viktor', t: 'You want the island? Come and take it from me, boy.' },
    { s: 'kai', t: 'It was never yours.' },
  ],
  'm6-ending': [
    { s: 'narrator', t: 'The sun comes up over Selara Bay, and for the first time in five years, the island belongs to the people who live on it.' },
    { s: 'lin', t: 'You did it, sayang. Now — breakfast. And then we rebuild the garage.' },
    { s: 'kai', t: 'Breakfast first. The island can wait one more hour.' },
  ],
};
