import { useEffect, useState } from "react";
import {
  doc,
  onSnapshot,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import Card from "../../components/Card";
import GradientHeader from "../../components/GradientHeader";
import { db } from "../../lib/firebase";
import { useAuth } from "../../state/auth";

const STUDENT_TODO_ITEMS_LIMIT = 80;

const formatTodoDateTime = (value) => {
  if (!value) return "";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getTodoTimestampMs = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const normalizeTodoItems = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const id = String(item?.id || "").trim();
      const text = String(item?.text || "").trim();
      if (!id || !text) return null;
      return {
        id,
        text,
        createdAt: item?.createdAt || null,
        createdBy: String(item?.createdBy || ""),
        completed: item?.completed === true,
      };
    })
    .filter(Boolean)
    .sort(
      (first, second) =>
        getTodoTimestampMs(second.createdAt) - getTodoTimestampMs(first.createdAt)
    )
    .slice(0, STUDENT_TODO_ITEMS_LIMIT);
};

const toSavableTodoItems = (value) =>
  normalizeTodoItems(value).map((item) => ({
    id: item.id,
    text: item.text,
    createdAt: item.createdAt || null,
    createdBy: item.createdBy || "",
    completed: item.completed === true,
  }));

const createTodoItemId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `todo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export default function StudentTodoListPage() {
  const { user } = useAuth();
  const [todoItems, setTodoItems] = useState([]);
  const [loadingTodoItems, setLoadingTodoItems] = useState(true);
  const [todoInput, setTodoInput] = useState("");
  const [todoStatus, setTodoStatus] = useState("");
  const [creatingTodo, setCreatingTodo] = useState(false);
  const [removingTodoId, setRemovingTodoId] = useState("");
  const [togglingTodoId, setTogglingTodoId] = useState("");

  useEffect(() => {
    if (!user?.uid) {
      setTodoItems([]);
      setLoadingTodoItems(false);
      return undefined;
    }

    setLoadingTodoItems(true);
    const userRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setTodoItems([]);
          setLoadingTodoItems(false);
          setTodoStatus("Unable to load your to-do list.");
          return;
        }

        const next = normalizeTodoItems(snapshot.data()?.todoItems);
        setTodoItems(next);
        setLoadingTodoItems(false);
      },
      () => {
        setTodoItems([]);
        setLoadingTodoItems(false);
        setTodoStatus("Unable to load your to-do list.");
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const persistTodoItems = async (items) => {
    if (!user?.uid) return;
    const userRef = doc(db, "users", user.uid);
    const nextItems = toSavableTodoItems(items);
    try {
      await updateDoc(userRef, { todoItems: nextItems });
    } catch {
      await setDoc(userRef, { todoItems: nextItems }, { merge: true });
    }
  };

  const handleAddTodoItem = async (event) => {
    event.preventDefault();
    if (!user?.uid || creatingTodo) return;

    const trimmedTask = todoInput.trim();
    if (!trimmedTask) {
      setTodoStatus("Enter a task before adding.");
      return;
    }

    setCreatingTodo(true);
    setTodoStatus("");
    const previousItems = todoItems;
    const optimisticItems = toSavableTodoItems([
      {
        id: createTodoItemId(),
        text: trimmedTask,
        createdAt: Timestamp.now(),
        createdBy: user.uid,
        completed: false,
      },
      ...todoItems,
    ]);
    setTodoItems(optimisticItems);
    setTodoInput("");
    try {
      await persistTodoItems(optimisticItems);
      setTodoStatus("Task added.");
    } catch {
      setTodoItems(previousItems);
      setTodoStatus("Unable to add task right now.");
    } finally {
      setCreatingTodo(false);
    }
  };

  const handleRemoveTodoItem = async (todoId) => {
    if (!user?.uid || !todoId || removingTodoId || togglingTodoId) return;

    setRemovingTodoId(todoId);
    setTodoStatus("");
    const previousItems = todoItems;
    const optimisticItems = toSavableTodoItems(
      todoItems.filter((item) => item.id !== todoId)
    );
    setTodoItems(optimisticItems);
    try {
      await persistTodoItems(optimisticItems);
      setTodoStatus("Task removed.");
    } catch {
      setTodoItems(previousItems);
      setTodoStatus("Unable to remove task right now.");
    } finally {
      setRemovingTodoId("");
    }
  };

  const handleToggleTodoItem = async (todoId) => {
    if (!user?.uid || !todoId || togglingTodoId || removingTodoId) return;

    setTogglingTodoId(todoId);
    setTodoStatus("");
    const previousItems = todoItems;
    const optimisticItems = toSavableTodoItems(
      todoItems.map((item) =>
        item.id === todoId ? { ...item, completed: !item.completed } : item
      )
    );
    setTodoItems(optimisticItems);
    try {
      await persistTodoItems(optimisticItems);
    } catch {
      setTodoItems(previousItems);
      setTodoStatus("Unable to update task right now.");
    } finally {
      setTogglingTodoId("");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <GradientHeader
        title="My To-Do List"
        subtitle="Add and remove your personal tasks"
      />

      <Card className="grid gap-4 sm:gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Student Planner</p>
          <span className="rounded-full border border-clay/30 bg-cream px-3 py-1 text-xs font-semibold text-ink/75">
            {todoItems.length} Task{todoItems.length === 1 ? "" : "s"}
          </span>
        </div>

        <form
          onSubmit={handleAddTodoItem}
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        >
          <input
            type="text"
            value={todoInput}
            onChange={(event) => {
              setTodoInput(event.target.value);
              setTodoStatus("");
            }}
            placeholder="Add a new task..."
            className="w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
          />
          <button
            type="submit"
            disabled={creatingTodo}
            className="w-full rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-black shadow disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
          >
            {creatingTodo ? "Adding..." : "Add"}
          </button>
        </form>

        {todoStatus ? (
          <p className="text-xs font-semibold text-ink/80">{todoStatus}</p>
        ) : null}

        {loadingTodoItems ? (
          <p className="text-sm text-ink/75">Loading tasks...</p>
        ) : todoItems.length === 0 ? (
          <p className="text-sm text-ink/75">
            No tasks yet. Add your first task.
          </p>
        ) : (
          <div className="grid gap-3">
            {todoItems.map((item) => {
              const taskText = String(item?.text || "").trim();
              if (!taskText) return null;
              const timeLabel = formatTodoDateTime(item?.createdAt);
              const isCompleted = item?.completed === true;
              const isRemoving = removingTodoId === item.id;
              const isToggling = togglingTodoId === item.id;
              const disableItemActions = isRemoving || isToggling;
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-clay/30 bg-white/95 px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <input
                      type="checkbox"
                      checked={isCompleted}
                      onChange={() => handleToggleTodoItem(item.id)}
                      disabled={disableItemActions}
                      className="mt-1 size-4 cursor-pointer rounded border-clay/40 text-clay accent-clay disabled:cursor-not-allowed"
                    />
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          isCompleted
                            ? "text-ink/55 line-through"
                            : "text-ink"
                        }`}
                      >
                        {taskText}
                      </p>
                    {timeLabel ? (
                      <p className="text-[11px] text-ink/65">{timeLabel}</p>
                    ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveTodoItem(item.id)}
                    disabled={disableItemActions}
                    className="self-start rounded-full border border-clay/35 bg-white px-3 py-1 text-[11px] font-semibold text-ink/75 hover:border-clay/50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRemoving
                      ? "Removing..."
                      : isToggling
                        ? "Updating..."
                        : "Remove"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
