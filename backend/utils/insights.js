const nlp = require("compromise");

const EMOTION_KEYWORDS = {
  joy: ["happy", "joy", "joyful", "excited", "glad", "grateful", "delighted", "cheerful", "smile"],
  sadness: ["sad", "down", "upset", "unhappy", "depressed", "tearful", "blue"],
  anger: ["angry", "mad", "furious", "frustrated", "irritated", "annoyed"],
  fear: ["afraid", "scared", "fearful", "anxious", "worried", "nervous", "terrified"],
  surprise: ["surprised", "astonished", "amazed", "startled", "shocked"],
  love: ["love", "loved", "loving", "cherish", "adore"],
  calm: ["calm", "relaxed", "peaceful", "serene", "content"],
};

const SHORT_TERM_MARKERS = [
  "today",
  "tonight",
  "tomorrow",
  "this week",
  "this weekend",
  "this month",
  "next week",
  "soon",
];

const LONG_TERM_MARKERS = [
  "next year",
  "someday",
  "eventually",
  "future",
  "long term",
  "long-term",
  "years",
];

const GOAL_KEYWORDS = [
  "goal",
  "plan",
  "aim",
  "dream",
  "aspire",
  "aspiration",
  "target",
  "objective",
  "hope",
  "intend",
];

const STATUS_FROM_MARKER = (marker, text) => {
  if (!marker) {
    const lower = text.toLowerCase();
    if (/(completed|finished|did|done)/.test(lower)) return "done";
    if (/(progress|working|started)/.test(lower)) return "in-progress";
    return "todo";
  }
  const normalized = marker.toLowerCase();
  if (["x", "✓", "✔"].includes(normalized)) return "done";
  if (["/", "-", "~"].includes(normalized)) return "in-progress";
  return "todo";
};

const detectEmotions = (tokens) => {
  const counts = {};
  tokens.forEach((token) => {
    Object.entries(EMOTION_KEYWORDS).forEach(([emotion, keywords]) => {
      if (keywords.includes(token)) {
        counts[emotion] = (counts[emotion] || 0) + 1;
      }
    });
  });
  return counts;
};

const extractTasks = (text) => {
  const tasks = [];
  const seen = new Set();
  const addTask = (description, status) => {
    const trimmed = description.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tasks.push({ description: trimmed, status });
  };

  const lines = text.split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const bulletMatch = trimmed.match(/^(?:[-*]|\d+[.)])\s*(?:\[(.)\])?\s*(.+)$/);
    if (bulletMatch) {
      const [, marker, content] = bulletMatch;
      addTask(content, STATUS_FROM_MARKER(marker, content));
      return;
    }

    const labelledMatch = trimmed.match(/^(todo|task|remember|focus)[:\-]\s*(.+)$/i);
    if (labelledMatch) {
      addTask(labelledMatch[2], "todo");
      return;
    }

    const doneMatch = trimmed.match(/^(done|completed)[:\-]\s*(.+)$/i);
    if (doneMatch) {
      addTask(doneMatch[2], "done");
      return;
    }
  });

  const sentenceDoc = nlp(text);
  sentenceDoc
    .sentences()
    .out("array")
    .forEach((sentence) => {
      const lower = sentence.toLowerCase();
      if (/(need to|have to|must|should|plan to|will)\s+/.test(lower)) {
        addTask(sentence, "todo");
      } else if (/(finished|completed|accomplished)/.test(lower)) {
        addTask(sentence, "done");
      }
    });

  return tasks;
};

const determineHorizon = (sentence) => {
  const lower = sentence.toLowerCase();
  if (SHORT_TERM_MARKERS.some((marker) => lower.includes(marker))) {
    return "short_term";
  }
  if (LONG_TERM_MARKERS.some((marker) => lower.includes(marker))) {
    return "long_term";
  }
  return "long_term";
};

const extractGoals = (text) => {
  const goals = [];
  const seen = new Set();
  const sentences = nlp(text).sentences().out("array");
  sentences.forEach((sentence) => {
    const lower = sentence.toLowerCase();
    if (GOAL_KEYWORDS.some((keyword) => lower.includes(keyword))) {
      const key = sentence.trim().toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      goals.push({
        description: sentence.trim(),
        horizon: determineHorizon(sentence),
      });
    }
  });
  return goals;
};

const extractInsights = (text, sentimentEngine) => {
  const safeText = text || "";
  const doc = nlp(safeText);
  const tokens = doc
    .terms()
    .out("array")
    .map((token) => token.toLowerCase());
  const emotions = detectEmotions(tokens);
  const tasks = extractTasks(safeText);
  const goals = extractGoals(safeText);

  const sentimentResult = sentimentEngine.analyze(safeText);
  const sentimentLabel =
    sentimentResult.score > 1
      ? "positive"
      : sentimentResult.score < -1
      ? "negative"
      : "neutral";

  return {
    sentiment: {
      label: sentimentLabel,
      score: sentimentResult.score,
      comparative: sentimentResult.comparative,
    },
    emotions,
    tasks,
    goals,
  };
};

module.exports = { extractInsights };
