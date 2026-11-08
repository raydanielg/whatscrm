import { createFileRoute } from "@tanstack/react-router";
import {
  Caption,
  Code,
  Display,
  Eyebrow,
  Heading,
  Kbd,
  Label,
  Prose,
  Text,
} from "@/components/ui/typography";
import { Brand } from "@/components/brand";

/**
 * Hidden visual-regression fixture for typography.
 *
 * Renders every key text component through the shared typography system
 * (src/components/ui/typography.tsx). If you find yourself stacking
 * `text-4xl font-bold tracking-tight` in a component, refactor to use
 * one of these primitives instead — they're the single source of truth.
 *
 * Not linked from anywhere. Regenerate baselines intentionally with:
 *   bunx playwright test typography-components-visual --update-snapshots
 */

type Cell = { id: string; label: string; render: () => React.ReactNode };

const CELLS: Cell[] = [
  { id: "h1", label: "Heading 1",   render: () => <Heading level={1}>Ag The quick brown fox</Heading> },
  { id: "h2", label: "Heading 2",   render: () => <Heading level={2}>Ag The quick brown fox</Heading> },
  { id: "h3", label: "Heading 3",   render: () => <Heading level={3}>Ag The quick brown fox</Heading> },
  { id: "h4", label: "Heading 4",   render: () => <Heading level={4}>Ag The quick brown fox</Heading> },
  { id: "h5", label: "Heading 5",   render: () => <Heading level={5}>Ag The quick brown fox</Heading> },
  { id: "h6", label: "Heading 6",   render: () => <Heading level={6}>Ag The quick brown fox</Heading> },
  {
    id: "lead",
    label: "Lead / body-lg",
    render: () => (
      <Text variant="body-lg" muted className="max-w-[60ch]">
        A lead paragraph introduces the section with slightly larger, muted body
        copy. AVAWAY To Ye — fi fl ffi ffl 0123456789.
      </Text>
    ),
  },
  {
    id: "body",
    label: "Body",
    render: () => (
      <Text variant="body-md" className="max-w-[60ch]">
        Body copy at the base text size. The quick brown fox jumps over the lazy
        dog. Kerning &amp; tracking: AVAWAY To Ye 1,234.56 — “curly” ‘quotes’ —
        fi fl ffi ffl.
      </Text>
    ),
  },
  {
    id: "small",
    label: "Body small",
    render: () => (
      <Text variant="body-sm" muted className="max-w-[60ch]">
        Small text. The quick brown fox jumps over the lazy dog 0123456789.
      </Text>
    ),
  },
  {
    id: "xs",
    label: "Body xs",
    render: () => (
      <Text variant="body-xs" muted className="max-w-[60ch]">
        Extra small caption. The quick brown fox jumps over the lazy dog 0123456789.
      </Text>
    ),
  },
  {
    id: "weights",
    label: "Weight ramp",
    render: () => (
      <div className="grid grid-cols-4 gap-x-6 gap-y-1">
        <Text as="span" variant="body-md" weight="regular">Normal 400</Text>
        <Text as="span" variant="body-md" weight="medium">Medium 500</Text>
        <Text as="span" variant="body-md" weight="semibold">Semibold 600</Text>
        <Text as="span" variant="body-md" weight="bold">Bold 700</Text>
      </div>
    ),
  },
  {
    id: "muted",
    label: "Muted body",
    render: () => (
      <Text variant="body-md" muted className="max-w-[60ch]">
        Muted foreground on background — used for secondary body copy.
      </Text>
    ),
  },
  {
    id: "link",
    label: "Inline link",
    render: () => (
      <Text variant="body-md" className="max-w-[60ch]">
        Body copy with an{" "}
        <a href="#" className="text-primary underline underline-offset-4">
          inline link
        </a>{" "}
        that inherits the surrounding line-height.
      </Text>
    ),
  },
  {
    id: "code",
    label: "Inline code",
    render: () => (
      <Text variant="body-md" className="max-w-[60ch]">
        Use <Code>npm run build</Code> to produce a production bundle.
      </Text>
    ),
  },
  {
    id: "pre",
    label: "Code block",
    render: () => (
      <Code block className="max-w-[60ch]">
        {`function greet(name: string) {\n  return \`Hello, \${name}!\`;\n}`}
      </Code>
    ),
  },
  {
    id: "list-ul",
    label: "Unordered list",
    render: () => (
      <Prose>
        <ul>
          <li>First bullet — the quick brown fox jumps.</li>
          <li>Second bullet — over the lazy dog.</li>
          <li>Third bullet — 0123456789.</li>
        </ul>
      </Prose>
    ),
  },
  {
    id: "list-ol",
    label: "Ordered list",
    render: () => (
      <Prose>
        <ol>
          <li>First step in a numbered list.</li>
          <li>Second step, still numbered.</li>
          <li>Third and final step.</li>
        </ol>
      </Prose>
    ),
  },
  {
    id: "blockquote",
    label: "Blockquote",
    render: () => (
      <Prose>
        <blockquote>
          “Typography is the craft of endowing human language with a durable
          visual form.” — Robert Bringhurst
        </blockquote>
      </Prose>
    ),
  },
  { id: "label", label: "Form label", render: () => <Label size="md">Email address</Label> },
  {
    id: "kbd",
    label: "Keyboard hint",
    render: () => (
      <Text variant="body-sm">
        Press <Kbd>⌘K</Kbd> to open the command palette.
      </Text>
    ),
  },
  { id: "caption",  label: "Caption",  render: () => <Caption>Last updated 2 hours ago</Caption> },
  { id: "eyebrow",  label: "Eyebrow",  render: () => <Eyebrow>Featured</Eyebrow> },
  { id: "display",  label: "Display",  render: () => <Display size="md">Ag <Brand /></Display> },
  {
    id: "table",
    label: "Table typography",
    render: () => (
      <table className="text-body-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left text-label-md px-3 py-2">Name</th>
            <th className="text-left text-label-md px-3 py-2">Role</th>
            <th className="text-right text-label-md px-3 py-2">Count</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/60">
            <td className="px-3 py-2">Alice</td>
            <td className="px-3 py-2 text-muted-foreground">Admin</td>
            <td className="px-3 py-2 text-right font-mono">1,234</td>
          </tr>
          <tr>
            <td className="px-3 py-2">Bob</td>
            <td className="px-3 py-2 text-muted-foreground">Agent</td>
            <td className="px-3 py-2 text-right font-mono">56</td>
          </tr>
        </tbody>
      </table>
    ),
  },
];

function TypographyVisualFixture() {
  return (
    <main
      data-testid="typography-visual-fixture"
      className="min-h-screen bg-background text-foreground p-10"
    >
      <Heading level={1} className="sr-only">
        Typography visual regression fixture
      </Heading>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-7xl">
        {CELLS.map(({ id, label, render }) => (
          <section
            key={id}
            data-testid={`type-cell-${id}`}
            aria-label={label}
            className="rounded-control border border-border bg-card text-card-foreground p-6"
          >
            {render()}
          </section>
        ))}
      </div>
    </main>
  );
}

export const Route = createFileRoute("/dev/typography")({
  head: () => ({
    meta: [
      { title: "Typography visual fixture" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TypographyVisualFixture,
});
