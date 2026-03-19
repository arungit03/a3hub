import {
  CSS_COURSE_DEFINITION,
  CSS_SAMPLE_TOPIC_OVERRIDES,
  CSS_TOPIC_ALIASES,
  CSS_TOPIC_TITLES,
  buildCssExampleForTopic,
  getCssTopicLevel,
} from "./cssCatalog.js";
import {
  HTML_COURSE_DEFINITION,
  HTML_SAMPLE_PROBLEMS_BY_TOPIC,
  HTML_SAMPLE_QUIZ_BY_TOPIC,
  HTML_SAMPLE_TOPIC_OVERRIDES,
  HTML_TOPIC_ALIASES,
  HTML_TOPIC_TITLES,
  buildHtmlExampleForTopic,
} from "./htmlCatalog.js";

const COURSE_DEFINITIONS = Object.freeze({
  python: {
    id: "python",
    title: "Python",
    subtitle: "Readable syntax for beginners",
    accent: "from-emerald-500 via-teal-500 to-cyan-500",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    compilerLabel: "Open Python Interpreter",
    compilerPath: "python",
    heroSummary:
      "Start with simple syntax, then move into data structures, file handling, and OOP.",
  },
  c: {
    id: "c",
    title: "C",
    subtitle: "Core programming with memory basics",
    accent: "from-sky-500 via-blue-500 to-indigo-500",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
    compilerLabel: "Open C Compiler",
    compilerPath: "c",
    heroSummary:
      "Learn structured programming, loops, functions, arrays, and pointers step by step.",
  },
  cpp: {
    id: "cpp",
    title: "C++",
    subtitle: "OOP and modern systems programming",
    accent: "from-violet-500 via-fuchsia-500 to-pink-500",
    badgeClass: "border-violet-200 bg-violet-50 text-violet-700",
    compilerLabel: "Open C++ Compiler",
    compilerPath: "cpp",
    heroSummary:
      "Build from syntax and loops into classes, constructors, inheritance, and STL basics.",
  },
  html: HTML_COURSE_DEFINITION,
  css: CSS_COURSE_DEFINITION,
});

const COURSE_TOPIC_TITLES = Object.freeze({
  python: [
    "Introduction",
    "Syntax",
    "Variables",
    "Data Types",
    "Operators",
    "Input/Output",
    "Strings",
    "Conditional Statements",
    "Loops",
    "Functions",
    "Lists",
    "Tuples",
    "Sets",
    "Dictionaries",
    "File Handling",
    "Exception Handling",
    "OOP",
    "Classes and Objects",
    "Constructors",
    "Inheritance",
    "Modules",
    "Packages",
    "List Comprehensions",
    "Lambda Functions",
    "Recursion",
    "Iterators",
    "Generators",
    "Decorators",
    "Regular Expressions",
    "JSON Handling",
    "Date and Time",
    "Assertions",
    "Testing with unittest",
    "Working with APIs",
    "Database Basics",
  ],
  c: [
    "Introduction to C",
    "Structure of C Program",
    "Variables",
    "Data Types",
    "Constants",
    "Operators",
    "Input and Output",
    "Conditional Statements",
    "Loops",
    "Functions",
    "Arrays",
    "Strings",
    "Pointers",
    "Structures",
    "Unions",
    "File Handling",
    "Dynamic Memory Allocation",
    "Storage Classes",
    "Scope Rules",
    "Recursion",
    "Preprocessor Directives",
    "Header Files",
    "Command Line Arguments",
    "Enumerations",
    "Typedef",
    "Bitwise Operators",
    "Multidimensional Arrays",
    "Pointer Arithmetic",
    "Linked Lists",
    "Function Pointers",
    "Macros",
    "Error Handling",
  ],
  cpp: [
    "Introduction to C++",
    "Syntax",
    "Variables",
    "Data Types",
    "Operators",
    "Input/Output",
    "Strings",
    "Conditional Statements",
    "Loops",
    "Functions",
    "Arrays",
    "Pointers",
    "Classes and Objects",
    "Constructors",
    "Destructors",
    "Inheritance",
    "Polymorphism",
    "Encapsulation",
    "File Handling",
    "STL Basics",
    "References",
    "Namespaces",
    "Function Overloading",
    "Operator Overloading",
    "Templates",
    "Exception Handling",
    "Vectors",
    "Maps",
    "Iterators",
    "Smart Pointers",
    "Lambda Expressions",
    "Friend Functions",
    "Virtual Functions",
    "Abstract Classes",
    "Move Semantics",
  ],
  html: HTML_TOPIC_TITLES,
  css: CSS_TOPIC_TITLES,
});

const GENERIC_QUIZ_PASS_PERCENTAGE = 60;

const TOPIC_CATEGORY_ALIASES = Object.freeze({
  "introduction-to-c": "introduction",
  "introduction-to-c++": "introduction",
  "structure-of-c-program": "program-structure",
  "input-output": "input-output",
  "input-and-output": "input-output",
  "conditional-statements": "conditionals",
  lists: "arrays",
  ...CSS_TOPIC_ALIASES,
  ...HTML_TOPIC_ALIASES,
});

const createSlug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/c\+\+/g, "c++")
    .replace(/[^a-z0-9+]+/g, "-")
    .replace(/^-+|-+$/g, "");

const createTopicKey = (courseId, slug) => `${courseId}:${slug}`;

const getTopicCategory = (slug) => TOPIC_CATEGORY_ALIASES[slug] || slug;

const normalizeText = (value) => String(value || "").trim();

const normalizeArray = (value) =>
  Array.isArray(value)
    ? value.map((entry) => normalizeText(entry)).filter(Boolean)
    : [];

const getQuizCodeLanguage = (courseId) =>
  courseId === "cpp"
    ? "cpp"
    : courseId === "c"
    ? "c"
    : courseId === "css"
    ? "css"
    : courseId === "html"
    ? "html"
    : "python";

const SAMPLE_TOPIC_OVERRIDES = Object.freeze({
  "python:variables": {
    explanation:
      "Variables store data that your program can reuse later. In Python, you create a variable by writing a name, an equals sign, and a value. You do not need to write the data type first.",
    syntax: `name = "Asha"
age = 19
percentage = 87.5`,
    exampleCode: `name = "Asha"
age = 19
percentage = 87.5

print("Name:", name)
print("Age:", age)
print("Percentage:", percentage)`,
    output: `Name: Asha
Age: 19
Percentage: 87.5`,
    notes: [
      "Choose clear variable names such as student_name or total_marks.",
      "Python lets you change the value of a variable later in the program.",
      "Variable names are case-sensitive, so age and Age are different.",
    ],
    commonMistakes: [
      "Starting a variable name with a number, such as 2marks.",
      "Using spaces inside a variable name, such as student name.",
      "Forgetting quotes around text values.",
    ],
  },
  "python:conditional-statements": {
    explanation:
      "Conditional statements help the program make decisions. Python checks a condition, and then runs one block when it is true and another block when it is false.",
    syntax: `if condition:
    # code
elif another_condition:
    # code
else:
    # code`,
    exampleCode: `marks = 72

if marks >= 90:
    print("Grade A")
elif marks >= 60:
    print("Grade B")
else:
    print("Grade C")`,
    output: "Grade B",
    notes: [
      "Python uses indentation to decide which statements belong inside if, elif, and else blocks.",
      "You can use multiple elif blocks when you have more than two choices.",
      "Conditions normally return True or False.",
    ],
    commonMistakes: [
      "Forgetting the colon at the end of the if line.",
      "Mixing indentation levels inside the same conditional block.",
      "Using = instead of == when comparing values.",
    ],
  },
  "c:variables": {
    explanation:
      "Variables in C must be declared with a data type before you use them. This tells the compiler how much memory to reserve and what kind of value the variable will hold.",
    syntax: `int age = 18;
float cgpa = 8.4f;
char grade = 'A';`,
    exampleCode: `#include <stdio.h>

int main(void) {
    int age = 18;
    float cgpa = 8.4f;
    char grade = 'A';

    printf("Age: %d\\n", age);
    printf("CGPA: %.1f\\n", cgpa);
    printf("Grade: %c\\n", grade);
    return 0;
}`,
    output: `Age: 18
CGPA: 8.4
Grade: A`,
    notes: [
      "Every variable in C needs a declared type such as int, float, or char.",
      "C statements normally end with a semicolon.",
      "Use %d, %f, and %c with printf for integers, floats, and characters.",
    ],
    commonMistakes: [
      "Using a variable before declaring it.",
      "Forgetting the semicolon after a declaration.",
      "Using the wrong format specifier in printf or scanf.",
    ],
  },
  "c:loops": {
    explanation:
      "Loops repeat a block of code. In C, the most common loops are for, while, and do...while. They help you print repeated output, process arrays, or calculate totals.",
    syntax: `for (initialization; condition; update) {
    // repeated code
}

while (condition) {
    // repeated code
}`,
    exampleCode: `#include <stdio.h>

int main(void) {
    int i;
    for (i = 1; i <= 5; i++) {
        printf("%d\\n", i);
    }
    return 0;
}`,
    output: `1
2
3
4
5`,
    notes: [
      "Use a for loop when you know how many times the loop should run.",
      "Use a while loop when the loop should continue until a condition changes.",
      "Always make sure the loop condition can become false.",
    ],
    commonMistakes: [
      "Forgetting to update the loop variable.",
      "Using the wrong condition and creating an infinite loop.",
      "Placing a semicolon immediately after the loop header.",
    ],
  },
  "cpp:classes-and-objects": {
    explanation:
      "A class is a blueprint, and an object is a real item created from that blueprint. In C++, classes help you group data and the functions that work on that data.",
    syntax: `class Student {
public:
    string name;
    void show();
};`,
    exampleCode: `#include <iostream>
#include <string>
using namespace std;

class Student {
public:
    string name;
    int age;

    void show() {
        cout << name << " " << age;
    }
};

int main() {
    Student s1;
    s1.name = "Meena";
    s1.age = 20;
    s1.show();
    return 0;
}`,
    output: "Meena 20",
    notes: [
      "A class can contain data members and member functions.",
      "public makes members accessible outside the class.",
      "An object uses dot notation to access members, such as s1.name.",
    ],
    commonMistakes: [
      "Forgetting the semicolon after the class definition.",
      "Using private members directly from main.",
      "Creating functions inside a class but never calling them.",
    ],
  },
  "cpp:constructors": {
    explanation:
      "A constructor is a special function that runs automatically when an object is created. It is useful for setting initial values so the object starts in a valid state.",
    syntax: `class Box {
public:
    int width;
    Box() {
        width = 5;
    }
};`,
    exampleCode: `#include <iostream>
using namespace std;

class Box {
public:
    int width;

    Box() {
        width = 5;
    }
};

int main() {
    Box b1;
    cout << b1.width;
    return 0;
}`,
    output: "5",
    notes: [
      "A constructor has the same name as the class.",
      "Constructors do not use a return type, not even void.",
      "You can create multiple constructors with different parameters.",
    ],
    commonMistakes: [
      "Writing a return type before the constructor name.",
      "Using a constructor name that does not match the class name.",
      "Forgetting to initialize important values.",
    ],
  },
  ...CSS_SAMPLE_TOPIC_OVERRIDES,
  ...HTML_SAMPLE_TOPIC_OVERRIDES,
});

const SAMPLE_PROBLEMS_BY_TOPIC = Object.freeze({
  "python:variables": [
    {
      id: "python-variables-problem-1",
      title: "Store Student Details",
      difficulty: "Easy",
      statement:
        "Create variables for a student's name, age, and city. Print each value on a new line with labels.",
      sampleInput: "",
      sampleOutput: `Name: Ravi
Age: 18
City: Chennai`,
      hint: "Create three variables first, then print them clearly.",
    },
    {
      id: "python-variables-problem-2",
      title: "Swap Two Numbers",
      difficulty: "Easy",
      statement:
        "Store two numbers in variables and swap their values. Print the values before and after swapping.",
      sampleInput: "",
      sampleOutput: `Before: 10 25
After: 25 10`,
      hint: "Python lets you swap values in one line using a, b = b, a.",
    },
    {
      id: "python-variables-problem-3",
      title: "Rectangle Area",
      difficulty: "Medium",
      statement:
        "Store length and breadth in variables. Find the area and print a sentence with the result.",
      sampleInput: "",
      sampleOutput: "Area of rectangle is 24",
      hint: "Area = length * breadth.",
    },
  ],
  "python:conditional-statements": [
    {
      id: "python-conditionals-problem-1",
      title: "Even Or Odd",
      difficulty: "Easy",
      statement:
        "Read a number and print Even if it is divisible by 2, otherwise print Odd.",
      sampleInput: "7",
      sampleOutput: "Odd",
      hint: "Use number % 2 == 0 in the condition.",
    },
    {
      id: "python-conditionals-problem-2",
      title: "Voting Eligibility",
      difficulty: "Easy",
      statement:
        "Read a person's age and print Eligible if age is 18 or more. Otherwise print Not Eligible.",
      sampleInput: "16",
      sampleOutput: "Not Eligible",
      hint: "One if-else block is enough here.",
    },
    {
      id: "python-conditionals-problem-3",
      title: "Largest Of Two Numbers",
      difficulty: "Medium",
      statement:
        "Read two numbers and print the larger number. If both are equal, print Both Equal.",
      sampleInput: "12 12",
      sampleOutput: "Both Equal",
      hint: "Use if, elif, and else clearly.",
    },
  ],
  "c:variables": [
    {
      id: "c-variables-problem-1",
      title: "Add Two Numbers",
      difficulty: "Easy",
      statement:
        "Declare two integer variables, store values, and print their sum.",
      sampleInput: "",
      sampleOutput: "Sum = 27",
      hint: "Use int variables and printf with %d.",
    },
    {
      id: "c-variables-problem-2",
      title: "Area Of Rectangle",
      difficulty: "Easy",
      statement:
        "Store length and breadth in variables. Find the area and print it.",
      sampleInput: "",
      sampleOutput: "Area = 35",
      hint: "Multiply the two variables and store the answer in another variable.",
    },
    {
      id: "c-variables-problem-3",
      title: "Temperature Details",
      difficulty: "Medium",
      statement:
        "Store temperature in Celsius and convert it to Fahrenheit. Print both values.",
      sampleInput: "",
      sampleOutput: `Celsius = 25
Fahrenheit = 77.0`,
      hint: "Use the formula F = (C * 9 / 5) + 32.",
    },
  ],
  "c:loops": [
    {
      id: "c-loops-problem-1",
      title: "Natural Numbers",
      difficulty: "Easy",
      statement: "Read n and print numbers from 1 to n using a loop.",
      sampleInput: "5",
      sampleOutput: `1
2
3
4
5`,
      hint: "Start from 1 and continue while i <= n.",
    },
    {
      id: "c-loops-problem-2",
      title: "Sum From 1 To n",
      difficulty: "Easy",
      statement: "Read n and print the sum of all numbers from 1 to n.",
      sampleInput: "4",
      sampleOutput: "10",
      hint: "Keep a running total inside the loop.",
    },
    {
      id: "c-loops-problem-3",
      title: "Multiplication Table",
      difficulty: "Medium",
      statement:
        "Read a number and print its multiplication table up to 10.",
      sampleInput: "3",
      sampleOutput: `3 x 1 = 3
3 x 2 = 6
...
3 x 10 = 30`,
      hint: "Use one loop and multiply the input by the loop counter.",
    },
  ],
  "cpp:classes-and-objects": [
    {
      id: "cpp-classes-objects-problem-1",
      title: "Rectangle Class",
      difficulty: "Easy",
      statement:
        "Create a Rectangle class with length and breadth. Add a function to print area.",
      sampleInput: "",
      sampleOutput: "Area = 24",
      hint: "Create an object and assign values before calling the method.",
    },
    {
      id: "cpp-classes-objects-problem-2",
      title: "Employee Details",
      difficulty: "Easy",
      statement:
        "Create an Employee class with name and id. Print both values using a member function.",
      sampleInput: "",
      sampleOutput: "Arun 1024",
      hint: "Keep the member function simple and direct.",
    },
    {
      id: "cpp-classes-objects-problem-3",
      title: "Book Information",
      difficulty: "Medium",
      statement:
        "Create a Book class with title and price. Display both values through an object.",
      sampleInput: "",
      sampleOutput: "C++ Basics 299",
      hint: "Use string for title and float or int for price.",
    },
  ],
  "cpp:constructors": [
    {
      id: "cpp-constructors-problem-1",
      title: "Student Constructor",
      difficulty: "Easy",
      statement:
        "Create a Student class with a constructor that sets name and age, then display them.",
      sampleInput: "",
      sampleOutput: "Latha 19",
      hint: "Use a parameterized constructor.",
    },
    {
      id: "cpp-constructors-problem-2",
      title: "Rectangle Constructor",
      difficulty: "Easy",
      statement:
        "Create a Rectangle class that receives length and breadth in the constructor and prints area.",
      sampleInput: "",
      sampleOutput: "Area = 28",
      hint: "Store the values inside the object first.",
    },
    {
      id: "cpp-constructors-problem-3",
      title: "Bank Account Opening Balance",
      difficulty: "Medium",
      statement:
        "Create a BankAccount class with a constructor that sets opening balance and account holder name.",
      sampleInput: "",
      sampleOutput: "Arjun 5000",
      hint: "Use a constructor with two parameters.",
    },
  ],
  ...HTML_SAMPLE_PROBLEMS_BY_TOPIC,
});

const SAMPLE_QUIZ_BY_TOPIC = Object.freeze({
  "python:variables": [
    {
      id: "python-variables-quiz-1",
      question: "Which symbol is used to assign a value to a variable in Python?",
      options: ["=", "==", ":", "->"],
      answerIndex: 0,
      explanation: "Python uses the single equals sign to assign values.",
    },
    {
      id: "python-variables-quiz-2",
      question: "Which variable name is valid in Python?",
      options: ["2name", "student name", "student_name", "class"],
      answerIndex: 2,
      explanation: "student_name follows Python naming rules.",
    },
    {
      id: "python-variables-quiz-3",
      question: "What will this code print?",
      code: `age = 20
print(type(age).__name__)`,
      codeLanguage: "python",
      options: ["str", "int", "float", "bool"],
      answerIndex: 1,
      explanation: "20 is stored as an integer value.",
    },
    {
      id: "python-variables-quiz-4",
      question: "Which line stores text correctly?",
      options: ["city = Chennai", "city = 'Chennai'", "city == 'Chennai'", "string city = 'Chennai'"],
      answerIndex: 1,
      explanation: "Text values must be wrapped in quotes.",
    },
    {
      id: "python-variables-quiz-5",
      type: "code",
      question: "Write one Python line that stores 25 in a variable named marks.",
      codeLanguage: "python",
      starterCode: "",
      placeholder: "marks = 25",
      expectedAnswer: "marks = 25",
      explanation: "This answer is checked by AI, and the reference answer is shown if it is wrong.",
    },
  ],
  "python:conditional-statements": [
    {
      id: "python-conditionals-quiz-1",
      question: "Which keyword is used when another condition must be checked after if?",
      options: ["loop", "elseif", "elif", "switch"],
      answerIndex: 2,
      explanation: "Python uses elif for additional conditions.",
    },
    {
      id: "python-conditionals-quiz-2",
      question: "What does == do in Python?",
      options: ["Assigns a value", "Checks equality", "Creates a variable", "Starts a loop"],
      answerIndex: 1,
      explanation: "== compares two values.",
    },
    {
      id: "python-conditionals-quiz-3",
      question: "What is required at the end of an if statement line?",
      options: [",", ";", ":", "."],
      answerIndex: 2,
      explanation: "Python condition lines end with a colon.",
    },
    {
      id: "python-conditionals-quiz-4",
      question: "What will this code print?",
      code: `marks = 45

if marks >= 50:
    print("Pass")
else:
    print("Retry")`,
      codeLanguage: "python",
      options: ["Pass", "Retry", "45", "No output"],
      answerIndex: 1,
      explanation: "The else block runs because 45 is less than 50.",
    },
    {
      id: "python-conditionals-quiz-5",
      type: "code",
      question:
        'Write a short Python if-else snippet that prints "Pass" when marks is 50 or more, otherwise prints "Retry".',
      codeLanguage: "python",
      starterCode: "marks = 50\n",
      placeholder: "if marks >= 50:\n    print(\"Pass\")\nelse:\n    print(\"Retry\")",
      expectedAnswer: `marks = 50
if marks >= 50:
    print("Pass")
else:
    print("Retry")`,
      explanation: "AI checks whether your condition and output are correct.",
    },
  ],
  "c:variables": [
    {
      id: "c-variables-quiz-1",
      question: "Which keyword declares an integer variable in C?",
      options: ["integer", "int", "num", "var"],
      answerIndex: 1,
      explanation: "int is the integer data type in C.",
    },
    {
      id: "c-variables-quiz-2",
      question: "Which symbol usually ends a C statement?",
      options: [":", ",", ";", "."],
      answerIndex: 2,
      explanation: "Most C statements end with a semicolon.",
    },
    {
      id: "c-variables-quiz-3",
      question: "What will this C code print?",
      code: `#include <stdio.h>

int main(void) {
    int age = 18;
    printf("%d", age);
    return 0;
}`,
      codeLanguage: "c",
      options: ["18", "%d", "age", "A"],
      answerIndex: 0,
      explanation: "The variable age stores 18, so printf prints 18.",
    },
    {
      id: "c-variables-quiz-4",
      question: "Which declaration stores one character?",
      options: ["char grade = 'A';", "string grade = 'A';", "int grade = 'A';", "text grade = 'A';"],
      answerIndex: 0,
      explanation: "char is the correct type for a single character.",
    },
    {
      id: "c-variables-quiz-5",
      type: "code",
      question: "Write one C declaration that stores 18 in an int variable named age.",
      codeLanguage: "c",
      starterCode: "",
      placeholder: "int age = 18;",
      expectedAnswer: "int age = 18;",
      explanation: "AI checks whether your declaration uses the right type, name, and value.",
    },
  ],
  "c:loops": [
    {
      id: "c-loops-quiz-1",
      question: "Which loop is commonly used when the number of repetitions is known?",
      options: ["switch", "for", "break", "typedef"],
      answerIndex: 1,
      explanation: "for loops are ideal for counted repetition.",
    },
    {
      id: "c-loops-quiz-2",
      question: "What happens if the loop variable is never updated?",
      options: [
        "The program becomes shorter",
        "The loop may run forever",
        "The compiler fixes it automatically",
        "The variable becomes constant",
      ],
      answerIndex: 1,
      explanation: "Without an update, the condition may never become false.",
    },
    {
      id: "c-loops-quiz-3",
      question: "Which part of a for loop checks whether the loop should continue?",
      options: ["Initialization", "Condition", "Update", "Body"],
      answerIndex: 1,
      explanation: "The condition controls whether the next iteration runs.",
    },
    {
      id: "c-loops-quiz-4",
      question: "Which keyword stops the current loop early?",
      options: ["stop", "break", "skip", "pause"],
      answerIndex: 1,
      explanation: "break exits the loop immediately.",
    },
    {
      id: "c-loops-quiz-5",
      type: "code",
      question: "Write a C for loop that prints the numbers 1 to 3.",
      codeLanguage: "c",
      starterCode: "int i;\n",
      placeholder: "for (i = 1; i <= 3; i++) {\n    printf(\"%d \", i);\n}",
      expectedAnswer: `int i;
for (i = 1; i <= 3; i++) {
    printf("%d ", i);
}`,
      explanation: "AI checks whether your loop starts, stops, and updates correctly.",
    },
  ],
  "cpp:classes-and-objects": [
    {
      id: "cpp-classes-objects-quiz-1",
      question: "What is a class in C++?",
      options: ["A loop statement", "A blueprint for creating objects", "A header file", "A constant value"],
      answerIndex: 1,
      explanation: "Classes define the structure and behavior of objects.",
    },
    {
      id: "cpp-classes-objects-quiz-2",
      question: "What will this C++ code print?",
      code: `#include <iostream>
using namespace std;

class Student {
  public:
    string name = "Riya";
};

int main() {
    Student s;
    cout << s.name;
    return 0;
}`,
      codeLanguage: "cpp",
      options: ["Student", "Riya", "name", "No output"],
      answerIndex: 1,
      explanation: "The object s uses the class member value Riya.",
    },
    {
      id: "cpp-classes-objects-quiz-3",
      question: "Which operator accesses public members of an object?",
      options: ["->", "::", ".", "#"],
      answerIndex: 2,
      explanation: "Dot notation is used with normal objects.",
    },
    {
      id: "cpp-classes-objects-quiz-4",
      question: "Why is public important in beginner examples?",
      options: [
        "It allows outside code to access the members",
        "It makes every loop faster",
        "It removes the need for main()",
        "It converts ints to strings",
      ],
      answerIndex: 0,
      explanation: "public members can be accessed from outside the class.",
    },
    {
      id: "cpp-classes-objects-quiz-5",
      type: "code",
      question:
        "Write two C++ lines that create a Student object named s1 and call its show() method.",
      codeLanguage: "cpp",
      starterCode: "",
      placeholder: "Student s1;\ns1.show();",
      expectedAnswer: `Student s1;
s1.show();`,
      explanation: "AI checks whether you create the object and call the member function correctly.",
    },
  ],
  "cpp:constructors": [
    {
      id: "cpp-constructors-quiz-1",
      question: "When does a constructor run?",
      options: ["When the program ends", "When an object is created", "Only after calling delete", "Only inside loops"],
      answerIndex: 1,
      explanation: "Constructors run automatically during object creation.",
    },
    {
      id: "cpp-constructors-quiz-2",
      question: "What is special about a constructor name?",
      options: ["It must match the class name", "It must start with init", "It must be public static", "It must end with _ctor"],
      answerIndex: 0,
      explanation: "Constructor names are the same as the class name.",
    },
    {
      id: "cpp-constructors-quiz-3",
      question: "Which statement about constructors is correct?",
      options: ["Constructors return int", "Constructors cannot take parameters", "Constructors do not have a return type", "Constructors are called with printf"],
      answerIndex: 2,
      explanation: "A constructor does not declare a return type.",
    },
    {
      id: "cpp-constructors-quiz-4",
      question: "What is this constructor doing?",
      code: `class Student {
  public:
    string name;

    Student() {
        name = "Arun";
    }
};`,
      codeLanguage: "cpp",
      options: [
        "Closing a file",
        "Initializing object values automatically",
        "Creating inheritance",
        "Removing the class",
      ],
      answerIndex: 1,
      explanation: "Constructors help objects start with proper values.",
    },
    {
      id: "cpp-constructors-quiz-5",
      type: "code",
      question: "Write one C++ line that creates a Box object named box.",
      codeLanguage: "cpp",
      starterCode: "",
      placeholder: "Box box;",
      expectedAnswer: "Box box;",
      explanation: "AI checks whether the object creation syntax is correct.",
    },
  ],
  ...HTML_SAMPLE_QUIZ_BY_TOPIC,
});

const PYTHON_TOPIC_EXAMPLES = Object.freeze({
  modules: {
    syntax: `import math`,
    exampleCode: `import math

print(math.sqrt(25))`,
    output: "5.0",
  },
  packages: {
    syntax: `from urllib.parse import urlparse`,
    exampleCode: `from urllib.parse import urlparse

parsed = urlparse("https://a3hub.app/learning/python")
print(parsed.path)`,
    output: "/learning/python",
  },
  "list-comprehensions": {
    syntax: `squares = [value * value for value in range(1, 4)]`,
    exampleCode: `squares = [value * value for value in range(1, 4)]
print(squares)`,
    output: "[1, 4, 9]",
  },
  "lambda-functions": {
    syntax: `double = lambda value: value * 2`,
    exampleCode: `double = lambda value: value * 2
print(double(7))`,
    output: "14",
  },
  recursion: {
    syntax: `def factorial(n):
    if n == 1:
        return 1
    return n * factorial(n - 1)`,
    exampleCode: `def factorial(n):
    if n == 1:
        return 1
    return n * factorial(n - 1)

print(factorial(5))`,
    output: "120",
  },
  iterators: {
    syntax: `items = iter([10, 20, 30])`,
    exampleCode: `items = iter([10, 20, 30])
print(next(items))
print(next(items))`,
    output: `10
20`,
  },
  generators: {
    syntax: `def countdown(start):
    while start > 0:
        yield start
        start -= 1`,
    exampleCode: `def countdown(start):
    while start > 0:
        yield start
        start -= 1

for value in countdown(3):
    print(value)`,
    output: `3
2
1`,
  },
  decorators: {
    syntax: `def decorator(fn):
    def wrapper():
        fn()
    return wrapper`,
    exampleCode: `def celebrate(fn):
    def wrapper():
        print("Start")
        fn()
    return wrapper

@celebrate
def greet():
    print("Hello")

greet()`,
    output: `Start
Hello`,
  },
  "regular-expressions": {
    syntax: `import re`,
    exampleCode: `import re

match = re.search(r"\\d+", "Room 204")
print(match.group())`,
    output: "204",
  },
  "json-handling": {
    syntax: `import json`,
    exampleCode: `import json

student = {"name": "Asha", "marks": 92}
print(json.dumps(student))`,
    output: '{"name": "Asha", "marks": 92}',
  },
  "date-and-time": {
    syntax: `from datetime import datetime`,
    exampleCode: `from datetime import datetime

slot = datetime(2026, 3, 18, 10, 30)
print(slot.strftime("%H:%M"))`,
    output: "10:30",
  },
  assertions: {
    syntax: `assert score >= 50`,
    exampleCode: `score = 78
assert score >= 50
print("Passed")`,
    output: "Passed",
  },
  "testing-with-unittest": {
    syntax: `from unittest import TestCase`,
    exampleCode: `from unittest import TestCase

class MathTest(TestCase):
    def test_add(self):
        self.assertEqual(2 + 2, 4)

test_case = MathTest()
print(test_case.assertEqual(2 + 2, 4) is None)`,
    output: "True",
  },
  "working-with-apis": {
    syntax: `from urllib.parse import urlencode`,
    exampleCode: `from urllib.parse import urlencode

params = {"page": 1, "search": "python"}
print(urlencode(params))`,
    output: "page=1&search=python",
  },
  "database-basics": {
    syntax: `import sqlite3`,
    exampleCode: `import sqlite3

connection = sqlite3.connect(":memory:")
cursor = connection.cursor()
cursor.execute("CREATE TABLE students (name TEXT)")
cursor.execute("INSERT INTO students VALUES ('Asha')")
cursor.execute("SELECT name FROM students")
print(cursor.fetchone()[0])`,
    output: "Asha",
  },
});

const C_TOPIC_EXAMPLES = Object.freeze({
  "storage-classes": {
    syntax: `static int count = 0;`,
    exampleCode: `#include <stdio.h>

void showCount(void) {
    static int count = 0;
    count++;
    printf("%d\\n", count);
}

int main(void) {
    showCount();
    showCount();
    return 0;
}`,
    output: `1
2`,
  },
  "scope-rules": {
    syntax: `int total = 5;`,
    exampleCode: `#include <stdio.h>

int main(void) {
    int total = 5;
    printf("%d\\n", total);

    {
        int total = 10;
        printf("%d\\n", total);
    }

    printf("%d", total);
    return 0;
}`,
    output: `5
10
5`,
  },
  recursion: {
    syntax: `int factorial(int n) {
    if (n == 1) {
        return 1;
    }
    return n * factorial(n - 1);
}`,
    exampleCode: `#include <stdio.h>

int factorial(int n) {
    if (n == 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

int main(void) {
    printf("%d", factorial(5));
    return 0;
}`,
    output: "120",
  },
  "preprocessor-directives": {
    syntax: `#define LIMIT 5`,
    exampleCode: `#include <stdio.h>
#define LIMIT 5

int main(void) {
    printf("%d", LIMIT);
    return 0;
}`,
    output: "5",
  },
  "header-files": {
    syntax: `#include <math.h>`,
    exampleCode: `#include <math.h>
#include <stdio.h>

int main(void) {
    printf("%.0f", sqrt(49));
    return 0;
}`,
    output: "7",
  },
  "command-line-arguments": {
    syntax: `int main(int argc, char *argv[])`,
    exampleCode: `#include <stdio.h>

int main(int argc, char *argv[]) {
    printf("%d", argc);
    return 0;
}`,
    output: "1",
  },
  enumerations: {
    syntax: `enum Day { MON, TUE, WED };`,
    exampleCode: `#include <stdio.h>

enum Day { MON, TUE, WED };

int main(void) {
    enum Day today = TUE;
    printf("%d", today);
    return 0;
}`,
    output: "1",
  },
  typedef: {
    syntax: `typedef unsigned long Count;`,
    exampleCode: `#include <stdio.h>

typedef unsigned long Count;

int main(void) {
    Count students = 42;
    printf("%lu", students);
    return 0;
}`,
    output: "42",
  },
  "bitwise-operators": {
    syntax: `result = left & right;`,
    exampleCode: `#include <stdio.h>

int main(void) {
    int result = 6 & 3;
    printf("%d", result);
    return 0;
}`,
    output: "2",
  },
  "multidimensional-arrays": {
    syntax: `int matrix[2][2] = {{1, 2}, {3, 4}};`,
    exampleCode: `#include <stdio.h>

int main(void) {
    int matrix[2][2] = {{1, 2}, {3, 4}};
    printf("%d", matrix[1][0]);
    return 0;
}`,
    output: "3",
  },
  "pointer-arithmetic": {
    syntax: `ptr = ptr + 1;`,
    exampleCode: `#include <stdio.h>

int main(void) {
    int values[3] = {10, 20, 30};
    int *ptr = values;
    ptr = ptr + 1;
    printf("%d", *ptr);
    return 0;
}`,
    output: "20",
  },
  "linked-lists": {
    syntax: `struct Node {
    int value;
    struct Node *next;
};`,
    exampleCode: `#include <stdio.h>

struct Node {
    int value;
    struct Node *next;
};

int main(void) {
    struct Node second = {20, NULL};
    struct Node first = {10, &second};
    printf("%d %d", first.value, first.next->value);
    return 0;
}`,
    output: "10 20",
  },
  "function-pointers": {
    syntax: `int (*operation)(int, int);`,
    exampleCode: `#include <stdio.h>

int add(int left, int right) {
    return left + right;
}

int main(void) {
    int (*operation)(int, int) = add;
    printf("%d", operation(3, 4));
    return 0;
}`,
    output: "7",
  },
  macros: {
    syntax: `#define SQUARE(x) ((x) * (x))`,
    exampleCode: `#include <stdio.h>
#define SQUARE(x) ((x) * (x))

int main(void) {
    printf("%d", SQUARE(5));
    return 0;
}`,
    output: "25",
  },
  "error-handling": {
    syntax: `if (file == NULL) {
    printf("Open failed");
}`,
    exampleCode: `#include <stdio.h>

int main(void) {
    FILE *file = fopen("missing.txt", "r");
    if (file == NULL) {
        printf("Open failed");
        return 0;
    }
    fclose(file);
    return 0;
}`,
    output: "Open failed",
  },
});

const CPP_TOPIC_EXAMPLES = Object.freeze({
  references: {
    syntax: `int &alias = value;`,
    exampleCode: `#include <iostream>
using namespace std;

int main() {
    int value = 10;
    int &alias = value;
    alias = 15;
    cout << value;
    return 0;
}`,
    output: "15",
  },
  namespaces: {
    syntax: `namespace School {
    int room = 101;
}`,
    exampleCode: `#include <iostream>
using namespace std;

namespace School {
    int room = 101;
}

int main() {
    cout << School::room;
    return 0;
}`,
    output: "101",
  },
  "function-overloading": {
    syntax: `int add(int a, int b);
double add(double a, double b);`,
    exampleCode: `#include <iostream>
using namespace std;

int add(int a, int b) {
    return a + b;
}

double add(double a, double b) {
    return a + b;
}

int main() {
    cout << add(2, 3) << "\\n";
    cout << add(2.5, 3.0);
    return 0;
}`,
    output: `5
5.5`,
  },
  "operator-overloading": {
    syntax: `Type operator+(const Type &other) const;`,
    exampleCode: `#include <iostream>
using namespace std;

class Count {
public:
    int value;

    Count(int number) : value(number) {}

    Count operator+(const Count &other) const {
        return Count(value + other.value);
    }
};

int main() {
    Count total = Count(4) + Count(6);
    cout << total.value;
    return 0;
}`,
    output: "10",
  },
  templates: {
    syntax: `template <typename T>
T maximum(T a, T b);`,
    exampleCode: `#include <iostream>
using namespace std;

template <typename T>
T maximum(T a, T b) {
    return a > b ? a : b;
}

int main() {
    cout << maximum(7, 4);
    return 0;
}`,
    output: "7",
  },
  "exception-handling": {
    syntax: `try {
    throw 404;
} catch (int code) {
    cout << code;
}`,
    exampleCode: `#include <iostream>
using namespace std;

int main() {
    try {
        throw 404;
    } catch (int code) {
        cout << code;
    }
    return 0;
}`,
    output: "404",
  },
  vectors: {
    syntax: `vector<int> values = {10, 20, 30};`,
    exampleCode: `#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<int> values = {10, 20, 30};
    cout << values[1];
    return 0;
}`,
    output: "20",
  },
  maps: {
    syntax: `map<string, int> marks;`,
    exampleCode: `#include <iostream>
#include <map>
#include <string>
using namespace std;

int main() {
    map<string, int> marks;
    marks["Math"] = 95;
    cout << marks["Math"];
    return 0;
}`,
    output: "95",
  },
  iterators: {
    syntax: `for (auto it = values.begin(); it != values.end(); ++it)`,
    exampleCode: `#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<int> values = {1, 2, 3};
    for (auto it = values.begin(); it != values.end(); ++it) {
        cout << *it;
    }
    return 0;
}`,
    output: "123",
  },
  "smart-pointers": {
    syntax: `auto item = make_unique<int>(42);`,
    exampleCode: `#include <iostream>
#include <memory>
using namespace std;

int main() {
    auto item = make_unique<int>(42);
    cout << *item;
    return 0;
}`,
    output: "42",
  },
  "lambda-expressions": {
    syntax: `auto add = [](int a, int b) { return a + b; };`,
    exampleCode: `#include <iostream>
using namespace std;

int main() {
    auto add = [](int a, int b) { return a + b; };
    cout << add(8, 5);
    return 0;
}`,
    output: "13",
  },
  "friend-functions": {
    syntax: `friend void showValue(const Box &box);`,
    exampleCode: `#include <iostream>
using namespace std;

class Box {
private:
    int value;

public:
    Box(int number) : value(number) {}
    friend void showValue(const Box &box);
};

void showValue(const Box &box) {
    cout << box.value;
}

int main() {
    Box box(9);
    showValue(box);
    return 0;
}`,
    output: "9",
  },
  "virtual-functions": {
    syntax: `virtual void show();`,
    exampleCode: `#include <iostream>
using namespace std;

class Person {
public:
    virtual void show() {
        cout << "Person";
    }
};

class Student : public Person {
public:
    void show() override {
        cout << "Student";
    }
};

int main() {
    Person *person = new Student();
    person->show();
    delete person;
    return 0;
}`,
    output: "Student",
  },
  "abstract-classes": {
    syntax: `virtual void show() = 0;`,
    exampleCode: `#include <iostream>
using namespace std;

class Shape {
public:
    virtual void show() = 0;
};

class Circle : public Shape {
public:
    void show() override {
        cout << "Circle";
    }
};

int main() {
    Circle circle;
    circle.show();
    return 0;
}`,
    output: "Circle",
  },
  "move-semantics": {
    syntax: `string target = move(source);`,
    exampleCode: `#include <iostream>
#include <string>
#include <utility>
using namespace std;

int main() {
    string source = "A3 Hub";
    string target = move(source);
    cout << target;
    return 0;
}`,
    output: "A3 Hub",
  },
});

const buildExampleForTopic = ({ courseId, slug }) => {
  const category = getTopicCategory(slug);

  if (courseId === "css") {
    return buildCssExampleForTopic({ slug, category });
  }

  if (courseId === "html") {
    return buildHtmlExampleForTopic({ slug, category });
  }

  if (courseId === "python") {
    if (category === "variables") {
      return {
        syntax: `count = 10
name = "A3 Hub"`,
        exampleCode: `count = 10
name = "A3 Hub"
print(count)
print(name)`,
        output: `10
A3 Hub`,
      };
    }
    if (category === "data-types") {
      return {
        syntax: `age = 20
price = 45.5
is_ready = True`,
        exampleCode: `age = 20
price = 45.5
is_ready = True

print(type(age).__name__)
print(type(price).__name__)
print(type(is_ready).__name__)`,
        output: `int
float
bool`,
      };
    }
    if (category === "conditionals") {
      return {
        syntax: `if value > 0:
    print("Positive")
else:
    print("Non-positive")`,
        exampleCode: `value = 7

if value > 0:
    print("Positive")
else:
    print("Non-positive")`,
        output: "Positive",
      };
    }
    if (category === "loops") {
      return {
        syntax: `for item in range(1, 4):
    print(item)`,
        exampleCode: `for item in range(1, 4):
    print(item)`,
        output: `1
2
3`,
      };
    }
    if (category === "functions") {
      return {
        syntax: `def add(a, b):
    return a + b`,
        exampleCode: `def add(a, b):
    return a + b

print(add(4, 6))`,
        output: "10",
      };
    }
    if (category === "arrays") {
      return {
        syntax: `numbers = [10, 20, 30]`,
        exampleCode: `numbers = [10, 20, 30]
for item in numbers:
    print(item)`,
        output: `10
20
30`,
      };
    }
    if (category === "tuples") {
      return {
        syntax: `point = (4, 6)`,
        exampleCode: `point = (4, 6)
print(point[0])
print(point[1])`,
        output: `4
6`,
      };
    }
    if (category === "sets") {
      return {
        syntax: `items = {1, 2, 2, 3}`,
        exampleCode: `items = {1, 2, 2, 3}
print(items)`,
        output: "{1, 2, 3}",
      };
    }
    if (category === "dictionaries") {
      return {
        syntax: `student = {"name": "Asha", "age": 19}`,
        exampleCode: `student = {"name": "Asha", "age": 19}
print(student["name"])
print(student["age"])`,
        output: `Asha
19`,
      };
    }
    if (category === "file-handling") {
      return {
        syntax: `with open("notes.txt", "w") as file:
    file.write("Hello")`,
        exampleCode: `with open("notes.txt", "w") as file:
    file.write("Hello")

with open("notes.txt", "r") as file:
    print(file.read())`,
        output: "Hello",
      };
    }
    if (category === "exception-handling") {
      return {
        syntax: `try:
    number = int(text)
except ValueError:
    print("Invalid")`,
        exampleCode: `try:
    number = int("12")
    print(number)
except ValueError:
    print("Invalid")`,
        output: "12",
      };
    }
    if (category === "oop" || category === "classes-and-objects") {
      return {
        syntax: `class Student:
    def show(self):
        print("Student")`,
        exampleCode: `class Student:
    def __init__(self, name):
        self.name = name

    def show(self):
        print(self.name)

student = Student("Anu")
student.show()`,
        output: "Anu",
      };
    }
    if (category === "constructors") {
      return {
        syntax: `def __init__(self, value):
    self.value = value`,
        exampleCode: `class Box:
    def __init__(self, width):
        self.width = width

box = Box(5)
print(box.width)`,
        output: "5",
      };
    }
    if (category === "inheritance") {
      return {
        syntax: `class Child(Parent):
    pass`,
        exampleCode: `class Animal:
    def speak(self):
        print("Animal sound")

class Dog(Animal):
    pass

dog = Dog()
dog.speak()`,
        output: "Animal sound",
      };
    }

    if (PYTHON_TOPIC_EXAMPLES[category]) {
      return PYTHON_TOPIC_EXAMPLES[category];
    }

    return {
      syntax: 'print("Hello, Python")',
      exampleCode: 'print("Hello, Python")',
      output: "Hello, Python",
    };
  }

  if (courseId === "c") {
    if (category === "program-structure") {
      return {
        syntax: `#include <stdio.h>

int main(void) {
    return 0;
}`,
        exampleCode: `#include <stdio.h>

int main(void) {
    printf("Program ready");
    return 0;
}`,
        output: "Program ready",
      };
    }
    if (category === "variables") {
      return {
        syntax: `int count = 10;
float price = 25.5f;`,
        exampleCode: `#include <stdio.h>

int main(void) {
    int count = 10;
    float price = 25.5f;
    printf("%d\\n%.1f", count, price);
    return 0;
}`,
        output: `10
25.5`,
      };
    }
    if (category === "constants") {
      return {
        syntax: `const int DAYS = 7;`,
        exampleCode: `#include <stdio.h>

int main(void) {
    const int DAYS = 7;
    printf("%d", DAYS);
    return 0;
}`,
        output: "7",
      };
    }
    if (category === "input-output") {
      return {
        syntax: `scanf("%d", &value);
printf("%d", value);`,
        exampleCode: `#include <stdio.h>

int main(void) {
    int value = 25;
    printf("Value: %d", value);
    return 0;
}`,
        output: "Value: 25",
      };
    }
    if (category === "conditionals") {
      return {
        syntax: `if (value > 0) {
    printf("Positive");
}`,
        exampleCode: `#include <stdio.h>

int main(void) {
    int value = -2;
    if (value > 0) {
        printf("Positive");
    } else {
        printf("Non-positive");
    }
    return 0;
}`,
        output: "Non-positive",
      };
    }
    if (category === "loops") {
      return {
        syntax: `for (int i = 1; i <= 3; i++) {
    printf("%d\\n", i);
}`,
        exampleCode: `#include <stdio.h>

int main(void) {
    for (int i = 1; i <= 3; i++) {
        printf("%d\\n", i);
    }
    return 0;
}`,
        output: `1
2
3`,
      };
    }
    if (category === "functions") {
      return {
        syntax: `int add(int a, int b);`,
        exampleCode: `#include <stdio.h>

int add(int a, int b) {
    return a + b;
}

int main(void) {
    printf("%d", add(4, 9));
    return 0;
}`,
        output: "13",
      };
    }
    if (category === "arrays") {
      return {
        syntax: `int values[3] = {10, 20, 30};`,
        exampleCode: `#include <stdio.h>

int main(void) {
    int values[3] = {10, 20, 30};
    for (int i = 0; i < 3; i++) {
        printf("%d\\n", values[i]);
    }
    return 0;
}`,
        output: `10
20
30`,
      };
    }
    if (category === "pointers") {
      return {
        syntax: `int *ptr = &value;`,
        exampleCode: `#include <stdio.h>

int main(void) {
    int value = 10;
    int *ptr = &value;
    printf("%d", *ptr);
    return 0;
}`,
        output: "10",
      };
    }
    if (category === "structures") {
      return {
        syntax: `struct Student {
    int id;
};`,
        exampleCode: `#include <stdio.h>

struct Student {
    int id;
};

int main(void) {
    struct Student s1 = {101};
    printf("%d", s1.id);
    return 0;
}`,
        output: "101",
      };
    }
    if (category === "unions") {
      return {
        syntax: `union Data {
    int whole;
    float decimal;
};`,
        exampleCode: `#include <stdio.h>

union Data {
    int whole;
    float decimal;
};

int main(void) {
    union Data data;
    data.whole = 25;
    printf("%d", data.whole);
    return 0;
}`,
        output: "25",
      };
    }
    if (category === "file-handling") {
      return {
        syntax: `FILE *file = fopen("demo.txt", "w");`,
        exampleCode: `#include <stdio.h>

int main(void) {
    FILE *file = fopen("demo.txt", "w");
    fprintf(file, "Hello");
    fclose(file);
    printf("File written");
    return 0;
}`,
        output: "File written",
      };
    }
    if (category === "dynamic-memory-allocation") {
      return {
        syntax: `int *items = malloc(3 * sizeof(int));`,
        exampleCode: `#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int *items = malloc(3 * sizeof(int));
    items[0] = 4;
    printf("%d", items[0]);
    free(items);
    return 0;
}`,
        output: "4",
      };
    }

    if (C_TOPIC_EXAMPLES[category]) {
      return C_TOPIC_EXAMPLES[category];
    }

    return {
      syntax: `#include <stdio.h>

int main(void) {
    printf("Hello, C");
    return 0;
}`,
      exampleCode: `#include <stdio.h>

int main(void) {
    printf("Hello, C");
    return 0;
}`,
      output: "Hello, C",
    };
  }

  if (CPP_TOPIC_EXAMPLES[category]) {
    return CPP_TOPIC_EXAMPLES[category];
  }

  if (category === "variables") {
    return {
      syntax: `int count = 10;
string name = "A3 Hub";`,
      exampleCode: `#include <iostream>
#include <string>
using namespace std;

int main() {
    int count = 10;
    string name = "A3 Hub";
    cout << count << "\\n" << name;
    return 0;
}`,
      output: `10
A3 Hub`,
    };
  }
  if (category === "constructors") {
    return {
      syntax: `ClassName() {
    // initialize values
}`,
      exampleCode: `#include <iostream>
using namespace std;

class Box {
public:
    int width;
    Box() {
        width = 5;
    }
};

int main() {
    Box box;
    cout << box.width;
    return 0;
}`,
      output: "5",
    };
  }
  if (category === "classes-and-objects" || category === "oop") {
    return {
      syntax: `class Student {
public:
    void show();
};`,
      exampleCode: `#include <iostream>
using namespace std;

class Student {
public:
    void show() {
        cout << "Student";
    }
};

int main() {
    Student s1;
    s1.show();
    return 0;
}`,
      output: "Student",
    };
  }

  return {
    syntax: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, C++";
    return 0;
}`,
    exampleCode: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, C++";
    return 0;
}`,
    output: "Hello, C++",
  };
};

const buildGenericExplanation = ({ courseTitle, topicTitle, courseId }) =>
  courseId === "css"
    ? `${topicTitle} is an important CSS topic. Learn the basic rule first, see how it changes the preview, and then practice with small style updates so the visual effect becomes easy to understand.`
    : `${topicTitle} is an important beginner topic in ${courseTitle}. Learn the basic form first, understand what each line does, and then practice with small changes so the idea becomes natural.`;

const buildGenericNotes = ({ courseTitle, topicTitle, courseId }) => [
  courseId === "css"
    ? `${topicTitle} becomes easier when you change one style at a time and refresh the preview.`
    : `${topicTitle} is easier to learn when you test one small change at a time in ${courseTitle}.`,
  "Read the syntax first, then compare it with the full example code.",
  courseId === "python"
    ? "Indentation is part of the syntax, so keep blocks aligned."
    : courseId === "css"
    ? "A small spelling mistake in a selector or property can stop the style from showing."
    : "Check punctuation like semicolons, braces, or parentheses while typing.",
];

const buildGenericKeyPoints = ({ topicTitle, courseId }) => [
  courseId === "css"
    ? `${topicTitle} changes how a page looks, not the HTML structure itself.`
    : `${topicTitle} is easier when you understand the base syntax first.`,
  "Start with the syntax, then compare it with the complete example.",
  "Practice with one small change at a time so the effect stays clear.",
];

const buildGenericMistakes = ({ topicTitle, courseId }) => [
  `Skipping small syntax details while learning ${topicTitle}.`,
  "Trying to solve the whole problem at once instead of testing a tiny step first.",
  courseId === "python"
    ? "Mixing indentation levels in the same block."
    : courseId === "css"
    ? "Misspelling a selector, property, or value and expecting the browser to guess it."
    : "Forgetting punctuation such as semicolons or braces.",
];

const buildGenericProblems = ({ courseTitle, topicTitle, topicId }) => [
  {
    id: `${topicId}-problem-1`,
    title: `${topicTitle} Warm-up`,
    difficulty: "Easy",
    statement:
      courseTitle === "CSS"
        ? `Create a small HTML block and apply ${topicTitle} so the visual change is easy to notice.`
        : `Write a simple ${courseTitle} program that demonstrates the basic idea of ${topicTitle}.`,
    sampleInput: "",
    sampleOutput: `${topicTitle} example`,
    hint:
      courseTitle === "CSS"
        ? "Reuse the lesson syntax and test one style change at a time."
        : "Reuse the lesson syntax and keep the first version very small.",
  },
  {
    id: `${topicId}-problem-2`,
    title: `${topicTitle} With User Values`,
    difficulty: "Easy",
    statement:
      courseTitle === "CSS"
        ? `Style a simple card, button, or list using ${topicTitle} and make the final result look cleaner than the default browser style.`
        : `Create a program that uses ${topicTitle} with values entered by the user and prints the result clearly.`,
    sampleInput: courseTitle === "CSS" ? "" : "5",
    sampleOutput: "Result shown clearly",
    hint:
      courseTitle === "CSS"
        ? "Choose one visible part of the UI and improve it step by step."
        : "Take one input, apply the topic idea, and print a readable answer.",
  },
  {
    id: `${topicId}-problem-3`,
    title: `${topicTitle} Mini Challenge`,
    difficulty: "Medium",
    statement:
      courseTitle === "CSS"
        ? `Build a small real-world layout or component using ${topicTitle}. Focus on readable spacing, alignment, and clean styling.`
        : `Solve a short real-world task using ${topicTitle} in ${courseTitle}. Break the logic into clear steps before coding.`,
    sampleInput: "",
    sampleOutput: "Correct final output",
    hint:
      courseTitle === "CSS"
        ? "Sketch the structure first, then add the styles in small layers."
        : "Write the steps in plain English first, then convert them into code.",
  },
];

const buildGenericQuiz = ({
  courseId,
  courseTitle,
  topicTitle,
  topicId,
  exampleCode,
  output,
}) =>
  courseId === "css"
    ? [
        {
          id: `${topicId}-quiz-1`,
          question: `What is the main purpose of ${topicTitle} in CSS?`,
          options: [
            "It changes the appearance or layout of elements",
            "It creates a database table",
            "It removes all HTML tags",
            "It replaces the browser",
          ],
          answerIndex: 0,
          explanation: `${topicTitle} is used to create a specific styling or layout result.`,
        },
        {
          id: `${topicId}-quiz-2`,
          question: `What is the best way to learn ${topicTitle}?`,
          options: [
            "Change one style at a time and refresh the preview",
            "Memorize long CSS files without testing",
            "Skip the example and only read the title",
            "Avoid checking the browser result",
          ],
          answerIndex: 0,
          explanation: "Small visual changes make CSS concepts much easier to understand.",
        },
        {
          id: `${topicId}-quiz-3`,
          question: `Which preview description best matches this CSS example?`,
          code: exampleCode,
          codeLanguage: getQuizCodeLanguage(courseId),
          options: [
            output,
            "The browser stops loading all styles forever",
            "The code only creates comments and nothing else",
            "The example becomes a database query",
          ],
          answerIndex: 0,
          explanation: "Reading the CSS and connecting it to the preview builds real understanding.",
        },
        {
          id: `${topicId}-quiz-4`,
          question: `Which habit usually improves results in ${topicTitle}?`,
          options: [
            "Testing small style changes after each step",
            "Changing the whole stylesheet at once",
            "Ignoring the browser preview",
            "Skipping notes and common mistakes",
          ],
          answerIndex: 0,
          explanation: "Small, visible changes reduce confusion and make debugging faster.",
        },
        {
          id: `${topicId}-quiz-5`,
          type: "code",
          question: `Write a short CSS example that demonstrates ${topicTitle}.`,
          codeLanguage: "css",
          starterCode: "/* Write your CSS answer here */\n",
          placeholder: `selector {\n  property: value;\n}`,
          expectedAnswer: exampleCode,
          explanation: `AI checks whether your CSS answer clearly demonstrates ${topicTitle}.`,
        },
      ]
    : [
        {
          id: `${topicId}-quiz-1`,
          question: `What is the main purpose of ${topicTitle} in ${courseTitle}?`,
          options: [
            "It helps solve a related programming task clearly",
            "It replaces the compiler completely",
            "It is used only for comments",
            "It is the same as deleting code",
          ],
          answerIndex: 0,
          explanation: `${topicTitle} helps solve a specific programming task.`,
        },
        {
          id: `${topicId}-quiz-2`,
          question: `What is the best way to learn ${topicTitle}?`,
          options: [
            "Start with small examples and test them one by one",
            "Memorize every possible output without practice",
            "Skip syntax and only read theory",
            "Avoid running the code",
          ],
          answerIndex: 0,
          explanation: "Short examples make the concept easier to understand and debug.",
        },
        {
          id: `${topicId}-quiz-3`,
          question: `What output is most likely from this ${courseTitle} code example?`,
          code: exampleCode,
          codeLanguage: getQuizCodeLanguage(courseId),
          options: [
            output,
            "Compilation error in every language",
            "No output at all",
            "The code only creates comments",
          ],
          answerIndex: 0,
          explanation: "Reading the code and matching it with output builds real understanding.",
        },
        {
          id: `${topicId}-quiz-4`,
          question: `Which habit usually improves results in ${topicTitle}?`,
          options: [
            "Testing small changes after each step",
            "Changing everything at once",
            "Ignoring compiler errors",
            "Skipping practice problems",
          ],
          answerIndex: 0,
          explanation: "Small, testable steps reduce confusion and make debugging easier.",
        },
        {
          id: `${topicId}-quiz-5`,
          type: "code",
          question: `Write a short ${courseTitle} example that demonstrates ${topicTitle}.`,
          codeLanguage: getQuizCodeLanguage(courseId),
          starterCode: courseId === "html" ? "<!-- Write your answer here -->" : "",
          placeholder:
            courseId === "html"
              ? "<p>Hello</p>"
              : courseId === "python"
              ? "# Write your answer here"
              : "// Write your answer here",
          expectedAnswer: exampleCode,
          explanation: `AI checks whether your code clearly demonstrates ${topicTitle}.`,
        },
      ];

const buildTopic = ({ courseId, topicTitle, order }) => {
  const course = COURSE_DEFINITIONS[courseId];
  const slug = createSlug(topicTitle);
  const id = createTopicKey(courseId, slug);
  const override = SAMPLE_TOPIC_OVERRIDES[id] || {};
  const example = buildExampleForTopic({ courseId, slug });
  const defaultExplanation = buildGenericExplanation({
    courseTitle: course.title,
    topicTitle,
    courseId,
  });

  return {
    id,
    courseId,
    slug,
    order,
    title: topicTitle,
    lessonTitle: `${course.title} ${topicTitle}`,
    summary: override.explanation || defaultExplanation,
    explanation: override.explanation || defaultExplanation,
    syntax: override.syntax || example.syntax,
    exampleHtml: override.exampleHtml || example.exampleHtml || "",
    exampleCode: override.exampleCode || example.exampleCode,
    output: override.output || example.output,
    previewHtml: override.previewHtml || example.previewHtml || "",
    notes:
      override.notes ||
      buildGenericNotes({
        courseTitle: course.title,
        topicTitle,
        courseId,
      }),
    keyPoints:
      override.keyPoints ||
      buildGenericKeyPoints({
        topicTitle,
        courseId,
      }),
    commonMistakes:
      override.commonMistakes ||
      buildGenericMistakes({
        topicTitle,
        courseId,
      }),
    practiceProblems:
      SAMPLE_PROBLEMS_BY_TOPIC[id] ||
      buildGenericProblems({
        courseTitle: course.title,
        topicTitle,
        topicId: id,
      }),
    quizQuestions:
      SAMPLE_QUIZ_BY_TOPIC[id] ||
      buildGenericQuiz({
        courseId,
        courseTitle: course.title,
        topicTitle,
        topicId: id,
        exampleCode: override.exampleCode || example.exampleCode,
        output: override.output || example.output,
      }),
    level:
      override.level ||
      (courseId === "css"
        ? getCssTopicLevel(slug).replace(/^\w/, (char) => char.toUpperCase())
        : ""),
    passPercentage: GENERIC_QUIZ_PASS_PERCENTAGE,
  };
};

const BASE_TOPICS = Object.entries(COURSE_TOPIC_TITLES).flatMap(
  ([courseId, topicTitles]) =>
    topicTitles.map((topicTitle, index) =>
      buildTopic({
        courseId,
        topicTitle,
        order: index + 1,
      })
    )
);

const BASE_COURSES = Object.values(COURSE_DEFINITIONS).map((course) => {
  const topics = BASE_TOPICS.filter((topic) => topic.courseId === course.id);
  return {
    ...course,
    totalTopics: topics.length,
    topicSlugs: topics.map((topic) => topic.slug),
  };
});

const createTopicSeedDoc = (topic) => ({
  id: topic.id,
  topicId: topic.id,
  courseId: topic.courseId,
  slug: topic.slug,
  title: topic.title,
  order: topic.order,
  explanation: topic.explanation,
  syntax: topic.syntax,
  exampleHtml: topic.exampleHtml || "",
  exampleCode: topic.exampleCode,
  output: topic.output,
  previewHtml: topic.previewHtml || "",
  notes: topic.notes,
  keyPoints: topic.keyPoints || [],
  commonMistakes: topic.commonMistakes,
  level: topic.level || "",
  isArchived: false,
});

const createQuizSeedDoc = (topic) => ({
  id: topic.id,
  topicId: topic.id,
  courseId: topic.courseId,
  slug: topic.slug,
  passPercentage: topic.passPercentage,
  questions: topic.quizQuestions,
  isArchived: false,
});

const createProblemSeedDoc = (topic) => ({
  id: topic.id,
  topicId: topic.id,
  courseId: topic.courseId,
  slug: topic.slug,
  problems: topic.practiceProblems,
  isArchived: false,
});

const sanitizeTopicDoc = (topicDoc = {}) => {
  const title = normalizeText(topicDoc.title);
  const courseId = normalizeText(topicDoc.courseId).toLowerCase();
  const slug = normalizeText(topicDoc.slug || createSlug(title));
  if (!title || !courseId || !slug) return null;

  return {
    id: createTopicKey(courseId, slug),
    topicId: createTopicKey(courseId, slug),
    courseId,
    slug,
    title,
    order: Number(topicDoc.order || 999),
    explanation: normalizeText(topicDoc.explanation),
    syntax: String(topicDoc.syntax || "").trim(),
    exampleHtml: String(topicDoc.exampleHtml || "").trim(),
    exampleCode: String(topicDoc.exampleCode || "").trim(),
    output: String(topicDoc.output || "").trim(),
    previewHtml: String(topicDoc.previewHtml || "").trim(),
    notes: normalizeArray(topicDoc.notes),
    keyPoints: normalizeArray(topicDoc.keyPoints),
    commonMistakes: normalizeArray(topicDoc.commonMistakes),
    level: normalizeText(topicDoc.level),
    isArchived: Boolean(topicDoc.isArchived),
  };
};

const sanitizeQuizDoc = (quizDoc = {}) => {
  const courseId = normalizeText(quizDoc.courseId).toLowerCase();
  const slug = normalizeText(quizDoc.slug);
  const topicId =
    normalizeText(quizDoc.topicId) ||
    (courseId && slug ? createTopicKey(courseId, slug) : "");
  if (!topicId) return null;

  return {
    topicId,
    questions: Array.isArray(quizDoc.questions)
      ? quizDoc.questions
          .map((question, index) => {
            const prompt = normalizeText(question?.question);
            const type = normalizeText(question?.type).toLowerCase();
            if (type === "code") {
              if (!prompt) {
                return null;
              }
              return {
                id: normalizeText(question?.id) || `${topicId}-quiz-${index + 1}`,
                type: "code",
                question: prompt,
                code: String(question?.code || "").trim(),
                codeLanguage: normalizeText(question?.codeLanguage).toLowerCase(),
                starterCode: String(question?.starterCode || "").trim(),
                placeholder: String(question?.placeholder || "").trim(),
                expectedAnswer: String(question?.expectedAnswer || "").trim(),
                explanation: normalizeText(question?.explanation),
              };
            }
            const options = Array.isArray(question?.options)
              ? question.options.map((item) => normalizeText(item)).filter(Boolean)
              : [];
            const answerIndex = Number(question?.answerIndex);
            if (!prompt || options.length < 2 || !Number.isInteger(answerIndex)) {
              return null;
            }
            return {
              id: normalizeText(question?.id) || `${topicId}-quiz-${index + 1}`,
              type: "mcq",
              question: prompt,
              code: String(question?.code || "").trim(),
              codeLanguage: normalizeText(question?.codeLanguage).toLowerCase(),
              options,
              answerIndex,
              explanation: normalizeText(question?.explanation),
            };
          })
          .filter(Boolean)
      : [],
    passPercentage: Number(quizDoc.passPercentage || GENERIC_QUIZ_PASS_PERCENTAGE),
    isArchived: Boolean(quizDoc.isArchived),
  };
};

const sanitizeProblemDoc = (problemDoc = {}) => {
  const courseId = normalizeText(problemDoc.courseId).toLowerCase();
  const slug = normalizeText(problemDoc.slug);
  const topicId =
    normalizeText(problemDoc.topicId) ||
    (courseId && slug ? createTopicKey(courseId, slug) : "");
  if (!topicId) return null;

  return {
    topicId,
    problems: Array.isArray(problemDoc.problems)
      ? problemDoc.problems
          .map((problem, index) => {
            const title = normalizeText(problem?.title);
            const statement = normalizeText(problem?.statement);
            if (!title || !statement) return null;
            return {
              id: normalizeText(problem?.id) || `${topicId}-problem-${index + 1}`,
              title,
              difficulty: normalizeText(problem?.difficulty) || "Easy",
              statement,
              sampleInput: String(problem?.sampleInput || "").trim(),
              sampleOutput: String(problem?.sampleOutput || "").trim(),
              hint: normalizeText(problem?.hint),
            };
          })
          .filter(Boolean)
      : [],
    isArchived: Boolean(problemDoc.isArchived),
  };
};

export const LEARNING_COLLECTIONS = Object.freeze({
  courses: "learningCourses",
  topics: "learningTopics",
  quizzes: "learningQuizzes",
  problems: "learningProblems",
  progress: "userLearningProgress",
});

export const LEARNING_COURSES = Object.freeze(BASE_COURSES);
export const LEARNING_TOPICS = Object.freeze(BASE_TOPICS);
export const LEARNING_SEED_DATA = Object.freeze({
  courses: LEARNING_COURSES.map((course) => ({
    id: course.id,
    title: course.title,
    subtitle: course.subtitle,
    accent: course.accent,
    badgeClass: course.badgeClass,
    compilerLabel: course.compilerLabel,
    compilerPath: course.compilerPath,
    toolLabel: course.toolLabel || course.compilerLabel,
    toolPath:
      course.toolPath ||
      (course.compilerPath ? `/code/${course.compilerPath}` : ""),
    heroSummary: course.heroSummary,
    totalTopics: course.totalTopics,
  })),
  topics: LEARNING_TOPICS.map(createTopicSeedDoc),
  quizzes: LEARNING_TOPICS.map(createQuizSeedDoc),
  problems: LEARNING_TOPICS.map(createProblemSeedDoc),
});

export const getCourseById = (courseId) =>
  LEARNING_COURSES.find((course) => course.id === courseId) || null;

export const buildLearningCatalog = (overrides = {}) => {
  const topicOverrides = (overrides.topicDocs || []).map(sanitizeTopicDoc).filter(Boolean);
  const quizOverrides = (overrides.quizDocs || []).map(sanitizeQuizDoc).filter(Boolean);
  const problemOverrides = (overrides.problemDocs || []).map(sanitizeProblemDoc).filter(Boolean);

  const lessonById = Object.fromEntries(topicOverrides.map((item) => [item.id, item]));
  const quizById = Object.fromEntries(quizOverrides.map((item) => [item.topicId, item]));
  const problemById = Object.fromEntries(problemOverrides.map((item) => [item.topicId, item]));

  const topicMap = {};

  LEARNING_TOPICS.forEach((topic) => {
    const lessonOverride = lessonById[topic.id];
    if (lessonOverride?.isArchived) return;
    const quizOverride = quizById[topic.id];
    const problemOverride = problemById[topic.id];
    topicMap[topic.id] = {
      ...topic,
      ...(lessonOverride || {}),
      quizQuestions:
        quizOverride?.questions?.length ? quizOverride.questions : topic.quizQuestions,
      practiceProblems:
        problemOverride?.problems?.length
          ? problemOverride.problems
          : topic.practiceProblems,
      passPercentage:
        Number.isFinite(Number(quizOverride?.passPercentage))
          ? Number(quizOverride.passPercentage)
          : topic.passPercentage,
    };
  });

  topicOverrides.forEach((topic) => {
    if (!topic || topic.isArchived || topicMap[topic.id]) return;
    topicMap[topic.id] = {
      id: topic.id,
      courseId: topic.courseId,
      slug: topic.slug,
      order: topic.order,
      title: topic.title,
      lessonTitle: `${getCourseById(topic.courseId)?.title || topic.courseId} ${topic.title}`,
      summary:
        topic.explanation ||
        buildGenericExplanation({
          courseTitle: getCourseById(topic.courseId)?.title || topic.courseId,
          topicTitle: topic.title,
          courseId: topic.courseId,
        }),
      explanation:
        topic.explanation ||
        buildGenericExplanation({
          courseTitle: getCourseById(topic.courseId)?.title || topic.courseId,
          topicTitle: topic.title,
          courseId: topic.courseId,
        }),
      syntax:
        topic.syntax ||
        (topic.courseId === "css"
          ? `selector {\n  property: value;\n}`
          : `// ${topic.title} syntax`),
      exampleHtml:
        topic.exampleHtml ||
        (topic.courseId === "css"
          ? `<div class="demo-block">${topic.title} example</div>`
          : ""),
      exampleCode:
        topic.exampleCode ||
        (topic.courseId === "css"
          ? `.demo-block {\n  property: value;\n}`
          : `// ${topic.title} example`),
      output: topic.output || topic.title,
      previewHtml: topic.previewHtml || "",
      notes:
        topic.notes?.length
          ? topic.notes
          : buildGenericNotes({
              courseTitle: getCourseById(topic.courseId)?.title || topic.courseId,
              topicTitle: topic.title,
              courseId: topic.courseId,
            }),
      keyPoints:
        topic.keyPoints?.length
          ? topic.keyPoints
          : buildGenericKeyPoints({
              topicTitle: topic.title,
              courseId: topic.courseId,
            }),
      commonMistakes:
        topic.commonMistakes?.length
          ? topic.commonMistakes
          : buildGenericMistakes({ topicTitle: topic.title, courseId: topic.courseId }),
      practiceProblems:
        problemById[topic.id]?.problems?.length
          ? problemById[topic.id].problems
          : buildGenericProblems({
              courseTitle: getCourseById(topic.courseId)?.title || topic.courseId,
              topicTitle: topic.title,
              topicId: topic.id,
            }),
      quizQuestions:
        quizById[topic.id]?.questions?.length
          ? quizById[topic.id].questions
          : buildGenericQuiz({
              courseId: topic.courseId,
              courseTitle: getCourseById(topic.courseId)?.title || topic.courseId,
              topicTitle: topic.title,
              topicId: topic.id,
              exampleCode:
                topic.exampleCode ||
                (topic.courseId === "css"
                  ? `.demo-block {\n  property: value;\n}`
                  : `<!-- ${topic.title} example -->`),
              output: topic.output || topic.title,
            }),
      level:
        topic.level ||
        (topic.courseId === "css"
          ? getCssTopicLevel(topic.slug).replace(/^\w/, (char) => char.toUpperCase())
          : ""),
      passPercentage:
        Number.isFinite(Number(quizById[topic.id]?.passPercentage))
          ? Number(quizById[topic.id].passPercentage)
          : GENERIC_QUIZ_PASS_PERCENTAGE,
    };
  });

  const topics = Object.values(topicMap).sort((left, right) =>
    left.courseId === right.courseId
      ? left.order - right.order
      : left.courseId.localeCompare(right.courseId)
  );

  const courses = LEARNING_COURSES.map((course) => {
    const topicsForCourse = topics.filter((topic) => topic.courseId === course.id);
    return {
      ...course,
      ...(overrides.courseDocs || []).find((item) => item.id === course.id),
      toolLabel:
        (overrides.courseDocs || []).find((item) => item.id === course.id)?.toolLabel ||
        course.toolLabel ||
        course.compilerLabel,
      toolPath:
        (overrides.courseDocs || []).find((item) => item.id === course.id)?.toolPath ||
        course.toolPath ||
        (course.compilerPath ? `/code/${course.compilerPath}` : ""),
      totalTopics: topicsForCourse.length,
      topicSlugs: topicsForCourse.map((topic) => topic.slug),
    };
  });

  const topicsById = Object.fromEntries(topics.map((topic) => [topic.id, topic]));
  const topicsByCourse = Object.fromEntries(
    courses.map((course) => [
      course.id,
      topics.filter((topic) => topic.courseId === course.id),
    ])
  );

  return { courses, topics, topicsById, topicsByCourse };
};

export const LEARNING_CATALOG = Object.freeze(buildLearningCatalog());

export const getTopicById = (topicId) =>
  LEARNING_CATALOG.topicsById[topicId] || null;

export const getTopicByCourseAndSlug = (courseId, slug) =>
  (LEARNING_CATALOG.topicsByCourse[courseId] || []).find(
    (topic) => topic.slug === slug
  ) || null;

export const getTopicsForCourse = (courseId) =>
  LEARNING_CATALOG.topicsByCourse[courseId] || [];

export const getNextTopic = (topicId, catalog = LEARNING_CATALOG) => {
  const ordered = catalog.courses.flatMap((course) => catalog.topicsByCourse[course.id] || []);
  const index = ordered.findIndex((topic) => topic.id === topicId);
  if (index < 0 || index >= ordered.length - 1) return null;
  return ordered[index + 1];
};

export const getPreviousTopic = (topicId, catalog = LEARNING_CATALOG) => {
  const ordered = catalog.courses.flatMap((course) => catalog.topicsByCourse[course.id] || []);
  const index = ordered.findIndex((topic) => topic.id === topicId);
  if (index <= 0) return null;
  return ordered[index - 1];
};

export const describeCourseRoute = (basePath, courseId) =>
  `${basePath}/learning/${courseId}`;

export const describeTopicRoute = (basePath, topic) =>
  `${basePath}/learning/${topic.courseId}/${topic.slug}`;
