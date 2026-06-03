// Automatically generated locales helper
export const translations = {
  "en": {
    "snake": "Snake",
    "score": "Score",
    "high": "High",
    "highScore": "High Score",
    "fullScreen": "Full Screen",
    "toggleFullScreen": "Toggle Fullscreen",
    "pause": "Pause",
    "resume": "Resume",
    "startGame": "Start Game",
    "pressStart": "Press Spacebar or tap Start to begin",
    "gameOver": "GAME OVER",
    "paused": "PAUSED",
    "pressResume": "Press Spacebar or tap Resume to continue",
    "playAgain": "Play Again",
    "scoredPrefix": "You scored",
    "scoredSuffix": "points.",
    "points": "points",
    "youWin": "You win!",
    "boardCleared": "You cleared the entire board."
  },
  "es": {
    "snake": "Serpiente",
    "score": "Puntuación",
    "high": "Máx",
    "highScore": "Puntuación máxima",
    "fullScreen": "Pantalla completa",
    "toggleFullScreen": "Alternar pantalla completa",
    "pause": "Pausa",
    "resume": "Reanudar",
    "startGame": "Iniciar juego",
    "pressStart": "Presiona Espacio o toca Iniciar para comenzar",
    "gameOver": "JUEGO TERMINADO",
    "paused": "EN PAUSA",
    "pressResume": "Presiona Espacio o toca Reanudar para continuar",
    "playAgain": "Jugar de nuevo",
    "scoredPrefix": "Conseguiste",
    "scoredSuffix": "puntos.",
    "points": "puntos",
    "youWin": "¡Ganaste!",
    "boardCleared": "Llenaste todo el tablero."
  },
  "fr": {
    "snake": "Serpent",
    "score": "Score",
    "high": "Record",
    "highScore": "Record",
    "fullScreen": "Plein écran",
    "toggleFullScreen": "Basculer le plein écran",
    "pause": "Pause",
    "resume": "Reprendre",
    "startGame": "Démarrer le jeu",
    "pressStart": "Appuyez sur Espace ou tapez sur Démarrer pour commencer",
    "gameOver": "PARTIE TERMINÉE",
    "paused": "EN PAUSE",
    "pressResume": "Appuyez sur Espace ou tapez sur Reprendre pour continuer",
    "playAgain": "Rejouer",
    "scoredPrefix": "Vous avez marqué",
    "scoredSuffix": "points.",
    "points": "points",
    "youWin": "Victoire !",
    "boardCleared": "Vous avez rempli tout le plateau."
  }
};

export function getLanguage(context) {
  // 1. Check degoog settings context.lang
  let lang = context?.lang;
  if (lang) {
    lang = lang.split('-')[0].toLowerCase();
    if (translations[lang]) return lang;
  }
  // 2. Fallback to browser UI language
  if (typeof document !== 'undefined') {
    let htmlLang = document.documentElement.lang;
    if (htmlLang) {
      htmlLang = htmlLang.split('-')[0].toLowerCase();
      if (translations[htmlLang]) return htmlLang;
    }
    let navLang = navigator.language;
    if (navLang) {
      navLang = navLang.split('-')[0].toLowerCase();
      if (translations[navLang]) return navLang;
    }
  }
  return 'en';
}

export function t(key, context) {
  const lang = getLanguage(context);
  return translations[lang]?.[key] || translations['en']?.[key] || key;
}
