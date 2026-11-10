# Tabs and modal dialog keyboard behavior

10 November2026, following clean `d2ebd103`. Standing approval covers this
bounded implementation, focused browser checks, temporary free public CI and
publication. Previous block/reference/component packets remain closed.

Source inspection found that Tabs exposes every tab as a separate Tab stop,
has no arrow/Home/End navigation and does not link tabs to panels. Dialog uses
a modal ARIA declaration on a fixed div while background controls remain
interactive; it has no initial focus, focus containment, Escape cancellation or
focus restoration. These are concrete gaps in the existing accessibility brief.

Preserve the existing public props. Tabs adds an optional group label, unique
per-instance tab/panel IDs, reciprocal ARIA links, one selected Tab stop,
horizontal Left/Right wrapping and Home/End selection. Native button Enter/Space
activation remains. Active content remains the only mounted content; inactive
panel containers remain hidden. Missing current items fall back to the first
available item; an empty list has no selected tab or panel. Navigation buttons
must not submit a surrounding form. Controlled consumers keep selection authority.

Dialog uses the browser's native modal dialog API within its own document. It
mounts its children only while open, focuses the visible title, keeps background content inert and the
Tab sequence inside the modal, and restores focus when closed or unmounted.
Escape requests onClose and prevents an uncontrolled native dismissal: the owner
still decides whether open becomes false. The explicit close button also only
requests onClose and does not submit a form. Native modality is scoped to the
iframe document; it does not make an embedding host's document inert. Styling
changes are limited to the dialog, panel focus and forced-color focus outlines.
No new dependency, broad design-system rewrite or provider/identity change.

Reference behavior follows the W3C
[Tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) and
[modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
with native lifecycle defined in the
[HTML dialog standard](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element).
This is a bounded implementation/check scope, not full WCAG, screenreader or
external-host certification. Full copied-source NodeNext and public npm remain open.

StorageGuard measured10.9GiB free/34GiB required on10November2026. Local heavy
application execution is unavailable. Use source/data/static preparation and one
owned20minute public Linux CI job with pinned existing tooling; no local build,
install, server, browser, database, production data, model or paid service.

The next frozen check proposal must cover fresh package and actual CLI-copy
consumers in real iframes, strict Bundler with skipLibCheck:false, both keyboard
and controlled lifecycle behavior, bounded selected color/motion profiles,
complete original streams and process/source cleanup. Generate all79registry
identities in scratch only. Accept changed registry content solely for the two
owned primitives/style sources; all other payload content and assets stay exact.
Measure prospective source, export, archive, packet and derived bounds before
execution. Adopt only independently verified generated output, then publish and
check actual production. No full current-product proof is inferred.
