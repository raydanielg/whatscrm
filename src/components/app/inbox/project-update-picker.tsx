import { useState } from "react";
import { FolderKanban, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildProjectUpdate } from "@/lib/inbox/project-update";
import { usePmProjects, usePmTasks, type PmProject } from "@/lib/project-management/client";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onInsert: (message: string) => void;
};

function ProjectTasks({
  project,
  workspaceId,
  onInsert,
}: {
  project: PmProject;
  workspaceId: string;
  onInsert: (message: string) => void;
}) {
  const tasksQuery = usePmTasks(workspaceId, project.id);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [taskSearch, setTaskSearch] = useState("");
  const tasks = (tasksQuery.data ?? []).filter(
    (task) => task.project_id === project.id && task.workspace_id === workspaceId,
  );
  const visibleTasks = tasks.filter((task) =>
    task.title.toLowerCase().includes(taskSearch.trim().toLowerCase()),
  );
  const selectedTasks = tasks.filter((task) => selectedIds.includes(task.id));
  const preview = buildProjectUpdate(project, selectedTasks);

  return (
    <div className="space-y-3">
      <div className="rounded-control border bg-muted/25 p-3">
        <div className="flex items-start gap-2">
          <FolderKanban className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium">{project.name}</p>
            <p className="text-xs text-muted-foreground">
              Pick only tasks you want the client to see. The message remains editable before
              sending.
            </p>
          </div>
        </div>
      </div>
      <Input
        aria-label="Search project tasks"
        value={taskSearch}
        onChange={(event) => setTaskSearch(event.target.value)}
        placeholder="Search tasks"
      />
      <div className="max-h-48 space-y-1 overflow-y-auto rounded-control border p-2">
        {tasksQuery.isLoading ? (
          <p className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks
          </p>
        ) : tasksQuery.isError ? (
          <p className="p-2 text-sm text-destructive">Could not load tasks. Try again later.</p>
        ) : visibleTasks.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">
            No matching tasks. You can still share the project status.
          </p>
        ) : (
          visibleTasks.map((task) => (
            <label
              key={task.id}
              className="flex cursor-pointer items-start gap-3 rounded-control p-2 hover:bg-muted"
            >
              <Checkbox
                aria-label={`Include ${task.title}`}
                checked={selectedIds.includes(task.id)}
                onCheckedChange={(checked) =>
                  setSelectedIds((current) =>
                    checked ? [...current, task.id] : current.filter((id) => id !== task.id),
                  )
                }
              />
              <span className="min-w-0 text-sm">
                <span className="block break-words font-medium">{task.title}</span>
                <span className="text-xs text-muted-foreground">
                  {task.status.replaceAll("_", " ")}
                  {task.due_date ? ` · Due ${task.due_date.slice(0, 10)}` : ""}
                </span>
              </span>
            </label>
          ))
        )}
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Message preview</p>
        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-control border bg-muted/30 p-3 font-sans text-sm">
          {preview}
        </pre>
      </div>
      <DialogFooter>
        <Button type="button" onClick={() => onInsert(preview)}>
          Add to message
        </Button>
      </DialogFooter>
    </div>
  );
}

export function ProjectUpdatePicker({ open, onOpenChange, workspaceId, onInsert }: Props) {
  const projectsQuery = usePmProjects(open ? workspaceId : null);
  const [search, setSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const projects = (projectsQuery.data ?? []).filter(
    (project) => project.workspace_id === workspaceId && project.status !== "archived",
  );
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const visibleProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const close = () => {
    setSearch("");
    setSelectedProjectId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Share a project update</DialogTitle>
          <DialogDescription>
            Choose a project and optional tasks. Review the draft in the composer before sending it
            to the client.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search projects"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search projects"
            className="pl-9"
          />
        </div>
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-control border p-2">
          {projectsQuery.isLoading ? (
            <p className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading projects
            </p>
          ) : projectsQuery.isError ? (
            <p className="p-2 text-sm text-destructive">
              Could not load projects. Check that Project Management is available in this workspace.
            </p>
          ) : visibleProjects.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">
              No projects found in this workspace.
            </p>
          ) : (
            visibleProjects.map((project) => (
              <Button
                key={project.id}
                type="button"
                variant={project.id === selectedProjectId ? "secondary" : "ghost"}
                className="h-auto w-full justify-start whitespace-normal text-left"
                onClick={() => setSelectedProjectId(project.id)}
              >
                <FolderKanban className="mr-2 h-4 w-4 shrink-0" /> {project.name}
              </Button>
            ))
          )}
        </div>
        {selectedProject && (
          <ProjectTasks
            key={selectedProject.id}
            project={selectedProject}
            workspaceId={workspaceId}
            onInsert={(message) => {
              onInsert(message);
              close();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
