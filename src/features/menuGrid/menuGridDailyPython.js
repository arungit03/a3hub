const DAILY_PYTHON_CHALLENGE_COUNT = 5;

const ensureScript = (src) =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
      } else {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.loaded = "false";
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", reject);
    document.body.appendChild(script);
  });

const normalizeChallengeOutput = (value) =>
  String(value || "")
    .replace(/\r/g, "")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);

export const outputsMatch = (actualOutput, expectedOutput) => {
  const actualTokens = normalizeChallengeOutput(actualOutput);
  const expectedTokens = normalizeChallengeOutput(expectedOutput);

  if (actualTokens.length !== expectedTokens.length) return false;

  const exactMatch = actualTokens.every(
    (token, index) => token === expectedTokens[index]
  );
  if (exactMatch) return true;

  return actualTokens.every(
    (token, index) => token.toLowerCase() === expectedTokens[index].toLowerCase()
  );
};

export const executePythonWithInput = async ({ sourceCode, stdin }) => {
  await ensureScript(
    "https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js"
  );
  await ensureScript(
    "https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt-stdlib.js"
  );

  const Sk = window.Sk;
  if (!Sk) {
    throw new Error("Python engine not available.");
  }

  const outputParts = [];
  const inputQueue = String(stdin || "")
    .replace(/\r/g, "")
    .split("\n");
  let inputIndex = 0;

  const builtinRead = (filename) => {
    if (!Sk.builtinFiles || !Sk.builtinFiles.files[filename]) {
      throw new Error(`File not found: '${filename}'`);
    }
    return Sk.builtinFiles.files[filename];
  };

  Sk.configure({
    output: (text) => {
      outputParts.push(String(text));
    },
    read: builtinRead,
    inputfun: () => Promise.resolve(inputQueue[inputIndex++] ?? ""),
    inputfunTakesPrompt: true,
  });

  const runPromise = Sk.misceval.asyncToPromise(() =>
    Sk.importMainWithBody("<stdin>", false, sourceCode, true)
  );

  let timerId = 0;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = window.setTimeout(() => {
      reject(new Error("Execution timeout. Check for infinite loops."));
    }, 4000);
  });

  await Promise.race([runPromise, timeoutPromise]).finally(() => {
    if (timerId) {
      window.clearTimeout(timerId);
    }
  });
  return outputParts.join("");
};

const createSeededRng = (seedText) => {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }

  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pickInt = (rng, min, max) =>
  Math.floor(rng() * (max - min + 1)) + min;

const shuffleWithRng = (items, rng) => {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

const buildNumberList = (rng, count, min, max) =>
  Array.from({ length: count }, () => pickInt(rng, min, max));

const isComplexDailyPythonSolutionCode = (sourceCode) => {
  const code = String(sourceCode || "");
  return (
    /\bimport\s+sys\b/.test(code) ||
    /\bsys\.stdin\b/.test(code) ||
    /\bdef\s+solve\s*\(/.test(code) ||
    /__name__\s*==\s*["']__main__["']/.test(code)
  );
};

export const getDailyPythonCorrectCode = (challenge) => {
  const solutionCode = String(challenge?.solutionCode || "").trim();
  if (!solutionCode) return "";
  if (isComplexDailyPythonSolutionCode(solutionCode)) return "";
  return solutionCode;
};

const DAILY_PYTHON_CHALLENGE_TEMPLATES = [
  {
    id: "sum-first-n",
    topic: "Loops",
    difficulty: "Easy",
    build: (rng) => {
      const n = pickInt(rng, 15, 45);
      return {
        title: "Sum of First N Numbers",
        statement: "Given N, print the sum of all numbers from 1 to N.",
        inputFormat: "A single integer N",
        outputFormat: "A single integer: sum(1..N)",
        sampleInput: String(n),
        sampleOutput: String((n * (n + 1)) / 2),
        hint: "Use an accumulator variable inside a for loop.",
      };
    },
  },
  {
    id: "even-odd-check",
    topic: "Conditionals",
    difficulty: "Easy",
    build: (rng) => {
      const value = pickInt(rng, 21, 999);
      return {
        title: "Even or Odd",
        statement:
          "Read one integer and print EVEN if it is divisible by 2, otherwise print ODD.",
        inputFormat: "A single integer N",
        outputFormat: "EVEN or ODD",
        sampleInput: String(value),
        sampleOutput: value % 2 === 0 ? "EVEN" : "ODD",
        hint: "Check `n % 2 == 0`.",
      };
    },
  },
  {
    id: "max-in-list",
    topic: "Lists",
    difficulty: "Easy",
    build: (rng) => {
      const list = buildNumberList(rng, 6, 3, 99);
      return {
        title: "Find Maximum in List",
        statement: "Read a list of integers and print the maximum value.",
        inputFormat:
          "First line: integer N\nSecond line: N space-separated integers",
        outputFormat: "Single integer maximum value",
        sampleInput: `${list.length}\n${list.join(" ")}`,
        sampleOutput: String(Math.max(...list)),
        hint: "Track max while iterating or use Python's max().",
      };
    },
  },
  {
    id: "count-vowels",
    topic: "Strings",
    difficulty: "Medium",
    build: (rng) => {
      const words = [
        "education",
        "algorithm",
        "pythonic",
        "developer",
        "automation",
      ];
      const word = words[pickInt(rng, 0, words.length - 1)];
      const vowels = new Set(["a", "e", "i", "o", "u"]);
      const count = word
        .toLowerCase()
        .split("")
        .filter((char) => vowels.has(char)).length;
      return {
        title: "Count Vowels",
        statement:
          "Given a lowercase word, count how many vowels (a, e, i, o, u) it contains.",
        inputFormat: "Single string S",
        outputFormat: "Single integer vowel count",
        sampleInput: word,
        sampleOutput: String(count),
        hint: "Loop through characters and check membership in a vowel set.",
      };
    },
  },
  {
    id: "second-largest",
    topic: "Lists",
    difficulty: "Medium",
    build: (rng) => {
      const list = buildNumberList(rng, 7, 10, 120);
      const sorted = [...new Set(list)].sort((a, b) => b - a);
      const second = sorted.length > 1 ? sorted[1] : sorted[0];
      return {
        title: "Second Largest Number",
        statement:
          "Given a list of integers, print the second largest distinct number.",
        inputFormat:
          "First line: integer N\nSecond line: N space-separated integers",
        outputFormat: "Single integer second largest value",
        sampleInput: `${list.length}\n${list.join(" ")}`,
        sampleOutput: String(second),
        hint: "Use a set to remove duplicates, then sort descending.",
      };
    },
  },
  {
    id: "fibonacci-n",
    topic: "Loops",
    difficulty: "Medium",
    build: (rng) => {
      const n = pickInt(rng, 5, 9);
      const sequence = [];
      let a = 0;
      let b = 1;
      for (let index = 0; index < n; index += 1) {
        sequence.push(a);
        const next = a + b;
        a = b;
        b = next;
      }
      return {
        title: "Print N Fibonacci Terms",
        statement:
          "Print the first N terms of the Fibonacci sequence starting from 0 and 1.",
        inputFormat: "Single integer N",
        outputFormat: "N space-separated integers",
        sampleInput: String(n),
        sampleOutput: sequence.join(" "),
        hint: "Maintain two variables and update them each iteration.",
      };
    },
  },
  {
    id: "palindrome-check",
    topic: "Strings",
    difficulty: "Medium",
    build: (rng) => {
      const samples = ["level", "civic", "radar", "python"];
      const word = samples[pickInt(rng, 0, samples.length - 1)];
      return {
        title: "Palindrome Checker",
        statement:
          "Given a word, print YES if it reads the same forwards and backwards, else print NO.",
        inputFormat: "Single string S",
        outputFormat: "YES or NO",
        sampleInput: word,
        sampleOutput:
          word === word.split("").reverse().join("") ? "YES" : "NO",
        hint: "Compare the string with its reverse.",
      };
    },
  },
  {
    id: "count-odd-even",
    topic: "Loops",
    difficulty: "Easy",
    build: (rng) => {
      const list = buildNumberList(rng, 8, 1, 30);
      const evenCount = list.filter((value) => value % 2 === 0).length;
      const oddCount = list.length - evenCount;
      return {
        title: "Count Even and Odd",
        statement:
          "Given a list of integers, print the number of even values and odd values.",
        inputFormat:
          "First line: integer N\nSecond line: N space-separated integers",
        outputFormat: "Two integers: even_count odd_count",
        sampleInput: `${list.length}\n${list.join(" ")}`,
        sampleOutput: `${evenCount} ${oddCount}`,
        hint: "Use modulus (%) to classify each number.",
      };
    },
  },
];

export const generateDailyPythonChallenges = (dateKey) => {
  const rng = createSeededRng(`a3hub-${dateKey}`);
  const selectedTemplates = shuffleWithRng(
    DAILY_PYTHON_CHALLENGE_TEMPLATES,
    rng
  ).slice(0, DAILY_PYTHON_CHALLENGE_COUNT);

  return selectedTemplates.map((template, index) => {
    const challenge = template.build(rng);
    return {
      id: `${dateKey}-${template.id}-${index + 1}`,
      title: challenge.title,
      topic: template.topic,
      difficulty: template.difficulty,
      statement: challenge.statement,
      inputFormat: challenge.inputFormat,
      outputFormat: challenge.outputFormat,
      sampleInput: challenge.sampleInput,
      sampleOutput: challenge.sampleOutput,
      hint: challenge.hint,
      solutionCode: "",
    };
  });
};
