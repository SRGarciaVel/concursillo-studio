import type { ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CircleCheck, GripVertical, ListOrdered, Plus, Trash } from "lucide-react";
import { Badge, Button, Card, IconButton, cn, roscoLetterOf, type BadgeVariant } from "@concursillo/ui";
import type { Difficulty, Question } from "@concursillo/shared-types";
import { DIFFICULTY_LABEL } from "./QuestionForm";

const DIFFICULTY_VARIANT: Record<Difficulty, BadgeVariant> = { Easy: "success", Medium: "warning", Hard: "danger" };
const LETTERS = ["A", "B", "C", "D"];

interface Props {
  questions: Question[];
  isRosco: boolean;
  selectedId: string | null;
  onSelect: (q: Question) => void;
  onNew: () => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  footer?: ReactNode;
}

function Row({
  q,
  index,
  isRosco,
  selected,
  sortable,
  onSelect,
  onRemove,
}: {
  q: Question;
  index: number;
  isRosco: boolean;
  selected: boolean;
  sortable: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: q.id,
    disabled: !sortable,
  });
  const answer = q.answers[q.correct];
  const optionLabel = q.answers.length > 1 ? `${LETTERS[q.correct] ?? q.correct + 1}: ` : "";

  return (
    <li
      ref={setNodeRef}
      style={{
        // Al arrastrar: se eleva, se inclina un poco y proyecta una sombra profunda.
        transform: [CSS.Translate.toString(transform), isDragging ? "rotate(-2.5deg) scale(1.04)" : ""].filter(Boolean).join(" ") || undefined,
        transition: isDragging ? undefined : transition,
        boxShadow: isDragging
          ? "0 28px 50px -12px rgb(0 0 0 / 0.75), 0 0 0 1px oklch(0.7 0.16 280 / 0.6), 0 0 32px -6px oklch(0.6 0.21 280 / 0.6)"
          : undefined,
        zIndex: isDragging ? 50 : undefined,
        cursor: isDragging ? "grabbing" : undefined,
      }}
      className={cn(
        "group relative flex items-stretch gap-2 rounded-xl border bg-zinc-900/80 transition-[border-color,background-color,box-shadow]",
        selected ? "border-brand-500/70 bg-brand-500/10 shadow-lg shadow-brand-600/10" : "border-line hover:border-white/15 hover:bg-zinc-800/70",
        isDragging && "border-brand-400 bg-zinc-800/95 backdrop-blur-sm",
      )}
    >
      {sortable ? (
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label="Arrastrar para reordenar"
          className="flex cursor-grab touch-none items-center rounded-l-xl px-1.5 text-zinc-600 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      ) : (
        <span className="w-1.5" />
      )}

      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-start gap-3 py-2.5 text-left focus-visible:outline-none">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-black",
            isRosco ? "bg-brand-500 text-white" : "bg-zinc-800 text-zinc-400",
          )}
        >
          {isRosco ? (roscoLetterOf(q) ?? "?") : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-medium leading-snug text-zinc-100">{q.question}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={DIFFICULTY_VARIANT[q.difficulty]} className="text-[10px]">
              {DIFFICULTY_LABEL[q.difficulty]}
            </Badge>
            <span className="truncate text-xs text-zinc-500">{q.category}</span>
            <span className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-emerald-300/90">
              <CircleCheck className="size-3 shrink-0" />
              <span className="truncate">
                {optionLabel}
                {answer}
              </span>
            </span>
          </span>
        </span>
      </button>

      <IconButton
        label="Eliminar pregunta"
        icon={Trash}
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="my-auto mr-1.5 text-zinc-500 opacity-0 transition-opacity hover:text-rose-300 focus-visible:opacity-100 group-hover:opacity-100"
      />
    </li>
  );
}

/** Lista de preguntas como tarjetas compactas. Millonario: reordenable con drag-and-drop. */
export function QuestionList({ questions, isRosco, selectedId, onSelect, onNew, onRemove, onReorder, footer }: Props) {
  const sensors = useSensors(
    // 6 px de margen para que un clic normal no empiece un arrastre.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const sortable = !isRosco && questions.length > 1;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  };

  return (
    <Card
      title={`Preguntas del set (${questions.length}${isRosco ? "/27" : ""})`}
      icon={ListOrdered}
      className="flex min-h-0 flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col gap-3"
      actions={
        <Button variant="primary" size="sm" icon={Plus} onClick={onNew}>
          Nueva
        </Button>
      }
    >
      {questions.length === 0 ? (
        <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
          Todavía no hay preguntas. Créalas con el formulario o en la pestaña Importar.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
            <ol className="-mr-2 flex max-h-[calc(100vh-22rem)] min-h-40 flex-col gap-2 overflow-y-auto pr-2">
              {questions.map((q, i) => (
                <Row
                  key={q.id}
                  q={q}
                  index={i}
                  isRosco={isRosco}
                  selected={q.id === selectedId}
                  sortable={sortable}
                  onSelect={() => onSelect(q)}
                  onRemove={() => onRemove(q.id)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      {sortable && <p className="text-xs text-zinc-500">Arrastra desde ⋮⋮ para cambiar el orden (también con el teclado: espacio + flechas).</p>}
      {footer}
    </Card>
  );
}
