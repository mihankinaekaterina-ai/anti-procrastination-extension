const taskType = document.getElementById("taskType");
const taskTitle = document.getElementById("taskTitle");
const taskDescription = document.getElementById("taskDescription");
const taskContent = document.getElementById("taskContent");
const feedback = document.getElementById("feedback");
const completeButton = document.getElementById("completeTask");

let selectedTask = null;
let currentTabId = null;
let returnUrl = "https://www.youtube.com/";
let isSubmitting = false;

const TASKS = {
  read: {
    type: "ПРОЧИТАТЬ МАТЕРИАЛ",
    title: "Прочитайте короткую страницу документации",
    description: "Откройте материал о console.log — команде, которая выводит сообщения в консоль JavaScript. Прочитайте страницу и вернитесь сюда.",
    link: "https://developer.mozilla.org/ru/docs/Web/API/console/log",
    button: "Я прочитал(а)"
  },
  solve: {
    type: "РЕШИТЬ НЕБОЛЬШУЮ ЗАДАЧУ",
    title: "Что выведет этот код?",
    description: "Подумайте, какое число появится в консоли. В JavaScript умножение выполняется раньше сложения.",
    code: "console.log(2 + 3 * 2);",
    answers: ["10", "8", "12"],
    correct: "8"
  },
  code: {
    type: "НАПИСАТЬ СТРОКУ КОДА",
    title: "Выведите приветствие в консоль",
    description: "Напишите одну строку JavaScript, которая выводит текст «Привет, мир!» в консоль.",
    placeholder: 'console.log("Привет, мир!");'
  }
};

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

function getCurrentTab() {
  return new Promise((resolve) => chrome.tabs.getCurrent((tab) => resolve(tab || null)));
}

async function initialize() {
  const tab = await getCurrentTab();
  currentTabId = tab?.id ?? null;

  if (Number.isInteger(currentTabId)) {
    const key = `pending_${currentTabId}`;
    const data = await chrome.storage.local.get(key);
    if (typeof data[key] === "string" && data[key].startsWith("http")) {
      returnUrl = data[key];
    }
  }

  const data = await chrome.storage.local.get("settings");
  const enabled = data.settings?.taskTypes || { read: true, solve: true, code: true };
  const availableTypes = Object.keys(TASKS).filter((type) => enabled[type]);

  if (availableTypes.length === 0) {
    selectedTask = "read";
  } else {
    selectedTask = availableTypes[Math.floor(Math.random() * availableTypes.length)];
  }

  renderTask(TASKS[selectedTask]);
}

function renderTask(task) {
  taskType.textContent = task.type;
  taskTitle.textContent = task.title;
  taskDescription.textContent = task.description;
  taskContent.innerHTML = "";
  completeButton.disabled = false;
  completeButton.textContent = task.button || "Я выполнил(а) задание";

  if (selectedTask === "read") {
    const link = document.createElement("a");
    link.className = "task-link";
    link.href = task.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Открыть страницу документации MDN ↗";
    taskContent.appendChild(link);
  }

  if (selectedTask === "solve") {
    const code = document.createElement("p");
    code.textContent = task.code;
    code.style.cssText = "margin: 0 0 10px; padding: 11px; border-radius: 8px; background: #f0f1f8; font-family: Consolas, monospace; font-size: 13px;";
    taskContent.appendChild(code);

    const answers = document.createElement("div");
    answers.className = "answer-list";
    task.answers.forEach((answer) => {
      const label = document.createElement("label");
      label.className = "answer-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "answer";
      input.value = answer;
      label.append(input, document.createTextNode(answer));
      answers.appendChild(label);
    });
    taskContent.appendChild(answers);
  }

  if (selectedTask === "code") {
    const textarea = document.createElement("textarea");
    textarea.id = "codeAnswer";
    textarea.className = "code-input";
    textarea.placeholder = task.placeholder;
    textarea.spellcheck = false;
    taskContent.appendChild(textarea);
  }
}

function isCorrectCode(value) {
  const compact = value.trim().replace(/\s+/g, "");
  return /^console\.log\((['"])Привет,мир!\1\);?$/i.test(compact);
}

async function completeTask() {
  if (isSubmitting) return;

  if (selectedTask === "solve") {
    const answer = document.querySelector('input[name="answer"]:checked');
    if (!answer) {
      feedback.textContent = "Выберите один из вариантов ответа.";
      return;
    }
    if (answer.value !== TASKS.solve.correct) {
      feedback.textContent = "Пока неверно. Попробуйте ещё раз.";
      return;
    }
  }

  if (selectedTask === "code") {
    const code = document.getElementById("codeAnswer").value;
    if (!isCorrectCode(code)) {
      feedback.textContent = 'Подсказка: используйте console.log("Привет, мир!");';
      return;
    }
  }

  isSubmitting = true;
  completeButton.disabled = true;
  completeButton.textContent = "Открываем доступ...";
  feedback.textContent = "";

  try {
    const response = await sendMessage({ type: "complete-task", tabId: currentTabId });
    if (!response?.ok) throw new Error(response?.error || "Не удалось открыть доступ.");

    taskTitle.textContent = "Отлично! Задание выполнено 🎉";
    taskDescription.textContent = `Доступ к сайтам отдыха открыт на ${response.rewardMinutes} минут.`;
    taskContent.innerHTML = "";
    completeButton.textContent = "Перейти на сайт";
    completeButton.disabled = false;
    completeButton.onclick = () => { window.location.href = returnUrl; };
    feedback.textContent = "";
  } catch (error) {
    feedback.textContent = error.message;
    completeButton.disabled = false;
    completeButton.textContent = "Попробовать ещё раз";
    isSubmitting = false;
  }
}

completeButton.addEventListener("click", completeTask);
initialize().catch((error) => {
  taskTitle.textContent = "Не удалось загрузить задание";
  taskDescription.textContent = error.message;
  completeButton.disabled = true;
});
