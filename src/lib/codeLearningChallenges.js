export const C_CHALLENGES = [
  {
    id: "c-sum-two-nums",
    title: "Sum Of Two Integers",
    difficulty: "Easy",
    statement:
      "Read two integers and print their sum.",
    inputFormat: "Two space-separated integers a and b",
    outputFormat: "One integer: a + b",
    hint: "Use scanf with two %d values and printf for output.",
    starterCode: `#include <stdio.h>

int main(void) {
    int a, b;
    scanf("%d %d", &a, &b);
    // Write your logic here
    return 0;
}
`,
    tests: [
      { stdin: "4 5\n", expectedOutput: "9" },
      { stdin: "-3 10\n", expectedOutput: "7" },
    ],
  },
  {
    id: "c-count-vowels",
    title: "Count Vowels",
    difficulty: "Medium",
    statement:
      "Read a lowercase string and print how many vowels (a, e, i, o, u) it contains.",
    inputFormat: "One lowercase word s",
    outputFormat: "One integer count",
    hint: "Iterate characters and compare each against vowel letters.",
    starterCode: `#include <stdio.h>

int main(void) {
    char s[201];
    scanf("%200s", s);
    // Write your logic here
    return 0;
}
`,
    tests: [
      { stdin: "banana\n", expectedOutput: "3" },
      { stdin: "queue\n", expectedOutput: "4" },
    ],
  },
  {
    id: "c-max-array",
    title: "Maximum In Array",
    difficulty: "Medium",
    statement:
      "Read n and then n integers. Print the maximum value.",
    inputFormat: "First line n, second line n integers",
    outputFormat: "Maximum integer",
    hint: "Track max while reading each value.",
    starterCode: `#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    int value, maxValue;
    for (int i = 0; i < n; i++) {
        scanf("%d", &value);
        // Write your logic here
    }
    printf("%d", maxValue);
    return 0;
}
`,
    tests: [
      { stdin: "5\n2 9 3 7 1\n", expectedOutput: "9" },
      { stdin: "4\n-10 -2 -30 -4\n", expectedOutput: "-2" },
    ],
  },
];

export const CPP_CHALLENGES = [
  {
    id: "cpp-even-or-odd",
    title: "Even Or Odd",
    difficulty: "Easy",
    statement:
      "Read one integer n and print EVEN if n is even, otherwise ODD.",
    inputFormat: "One integer n",
    outputFormat: "EVEN or ODD",
    hint: "Use n % 2 == 0.",
    starterCode: `#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    // Write your logic here
    return 0;
}
`,
    tests: [
      { stdin: "10\n", expectedOutput: "EVEN" },
      { stdin: "7\n", expectedOutput: "ODD" },
    ],
  },
  {
    id: "cpp-reverse-string",
    title: "Reverse A String",
    difficulty: "Medium",
    statement:
      "Read one string and print it in reverse order.",
    inputFormat: "One string s (no spaces)",
    outputFormat: "Reversed string",
    hint: "Loop from end to start or use reverse().",
    starterCode: `#include <iostream>
#include <string>
using namespace std;

int main() {
    string s;
    cin >> s;
    // Write your logic here
    return 0;
}
`,
    tests: [
      { stdin: "hello\n", expectedOutput: "olleh" },
      { stdin: "ckcet\n", expectedOutput: "teckc" },
    ],
  },
  {
    id: "cpp-fibonacci-n",
    title: "Nth Fibonacci",
    difficulty: "Medium",
    statement:
      "Read n (0 <= n <= 40) and print the nth Fibonacci number where F0=0, F1=1.",
    inputFormat: "One integer n",
    outputFormat: "F(n)",
    hint: "Use an iterative loop with two variables.",
    starterCode: `#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    // Write your logic here
    return 0;
}
`,
    tests: [
      { stdin: "0\n", expectedOutput: "0" },
      { stdin: "7\n", expectedOutput: "13" },
    ],
  },
];
