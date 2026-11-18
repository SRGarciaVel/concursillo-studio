import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { FileUp, Layers, ListOrdered, PenLine, Volume2 } from "lucide-react";
import { Badge, Tabs, type TabItem } from "@concursillo/ui";
import { ImportTab } from "./ImportTab";
import { PresetsTab } from "./PresetsTab";
import { QuestionsTab } from "./QuestionsTab";
import { SoundsTab } from "./SoundsTab";
import { useQuestionSet } from "./useQuestionSet";

type Tab = "questions" | "import" | "presets" | "sounds";
const TAB_ORDER: Record<Tab, number> = { questions: 0, import: 1, presets: 2, sounds: 3 };

/** Panel de pestaña animado: entra deslizándose desde el lado de la pestaña elegida. */
function TabPanel({ active, order, current, children }: { active: boolean; order: number; current: number; children: ReactNode }) {
  // Si la pestaña activa está a la derecha, este panel sale hacia la izquierda (y viceversa).
  const dx = order < current ? -28 : 28;
  return (
    <motion.div
      className="col-start-1 row-start-1 min-w-0"
      initial={false}
      animate={
        active
          ? { opacity: 1, x: 0, filter: "blur(0px)", display: "block", pointerEvents: "auto" }
          : { opacity: 0, x: dx, filter: "blur(4px)", pointerEvents: "none", transitionEnd: { display: "none" } }
      }
      transition={{ type: "spring", stiffness: 320, damping: 32, opacity: { duration: 0.18 } }}
      aria-hidden={!active}
    >
      {children}
    </motion.div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("questions");
  // El set en edición se comparte entre "Preguntas" e "Importar".
  const set = useQuestionSet();

  const tabs: TabItem<Tab>[] = [
    {
      id: "questions",
      label: "Preguntas",
      icon: ListOrdered,
      badge: set.questions.length > 0 ? <Badge variant={tab === "questions" ? "neutral" : "accent"} className="!px-1.5 !py-0 text-[10px]">{set.questions.length}</Badge> : undefined,
    },
    { id: "import", label: "Importar", icon: FileUp },
    { id: "presets", label: "Presets", icon: Layers },
    { id: "sounds", label: "Sonidos", icon: Volume2 },
  ];

  return (
    <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-4 p-4 lg:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-600 shadow-lg shadow-brand-600/30">
            <PenLine className="size-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight">Concursillo Studio</h1>
            <p className="text-xs text-zinc-500">Editor</p>
          </div>
        </div>
        <Tabs items={tabs} value={tab} onChange={setTab} />
      </header>

      {/*
        Las pestañas siguen montadas (no se pierde lo que se está editando) y se
        apilan en la misma celda: la saliente se desvanece mientras la nueva entra
        deslizándose. Al terminar, la oculta pasa a display:none.
      */}
      <div className="grid">
        <TabPanel active={tab === "questions"} order={0} current={TAB_ORDER[tab]}>
          <QuestionsTab set={set} />
        </TabPanel>
        <TabPanel active={tab === "import"} order={1} current={TAB_ORDER[tab]}>
          <ImportTab set={set} onImported={() => setTab("questions")} />
        </TabPanel>
        <TabPanel active={tab === "presets"} order={2} current={TAB_ORDER[tab]}>
          <PresetsTab />
        </TabPanel>
        <TabPanel active={tab === "sounds"} order={3} current={TAB_ORDER[tab]}>
          <SoundsTab />
        </TabPanel>
      </div>
    </div>
  );
}
