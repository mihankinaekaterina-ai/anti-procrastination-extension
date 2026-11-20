const elements = {
  statusText: document.getElementById("statusText"),
  statusHint: document.getElementById("statusHint"),
  tasksDone: document.getElementById("tasksDone"),
  minutesEarned: document.getElementById("minutesEarned"),
  taskRead: document.getElementById("taskRead"),
  taskSolve: document.getElementById("taskSolve"),
  taskCode: document.getElementById("taskCode"),
  rewardMinutes: document.getElementById("rewardMinutes"),
  saveSettings: document.getElementById("saveSettings"),
  saveMessage: document.getElementById("saveMessage")
};

let currentStatus = null;

function formatRemaining(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} мин ${String(seconds).padStart(2, "0")} сек`;
}

function renderStatus() {
  if (!currentStatus) return;

  const remaining = currentStatus.accessUntil - Date.now();
  if (remaining > 0) {
    elements.statusText.textContent = "Доступ к развлечениям открыт";
    elements.statusHint.textContent = `Осталось: ${formatRemaining(remaining)}`;
  } else {
    elements.statusText.textContent = "Сайты отдыха заблокированы";
    elements.statusHint.textContent = "Выполните небольшое задание, чтобы получить доступ";
  }
}

async function loadSettings() {
  const data = await chrome.storage.local.get(["settings", "stats", "accessUntil"]);
  const settings = data.settings || {
    taskTypes: { read: true, solve: true, code: true },
    rewardMinutes: 15
  };
  const stats = data.stats || { completedTasks: 0, earnedMinutes: 0 };

  elements.taskRead.checked = Boolean(settings.taskTypes?.read);
  elements.taskSolve.checked = Boolean(settings.taskTypes?.solve);
  elements.taskCode.checked = Boolean(settings.taskTypes?.code);
  elements.rewardMinutes.value = String(settings.rewardMinutes || 15);
  elements.tasksDone.textContent = String(stats.completedTasks || 0);
  elements.minutesEarned.textContent = String(stats.earnedMinutes || 0);

  currentStatus = { accessUntil: Number(data.accessUntil) || 0 };
  renderStatus();
}

elements.saveSettings.addEventListener("click", async () => {
  const taskTypes = {
    read: elements.taskRead.checked,
    solve: elements.taskSolve.checked,
    code: elements.taskCode.checked
  };

  if (!Object.values(taskTypes).some(Boolean)) {
    elements.saveMessage.textContent = "Выберите хотя бы один тип задания.";
    return;
  }

  const settings = {
    taskTypes,
    rewardMinutes: Number(elements.rewardMinutes.value)
  };

  await chrome.storage.local.set({ settings });
  chrome.runtime.sendMessage({ type: "settings-updated" });
  elements.saveMessage.style.color = "#36835b";
  elements.saveMessage.textContent = "Настройки сохранены.";
});

loadSettings().catch((error) => {
  elements.statusText.textContent = "Не удалось загрузить настройки";
  elements.statusHint.textContent = error.message;
});

setInterval(renderStatus, 1000);
