/* One expanding surface; degoog continues to own the filter inputs/searches. */
(() => {
    class ImageFilterControl {
        constructor({ page, sidebar, label, icon, closeTools }) {
            this.page = page;
            this.sidebar = sidebar;
            this.open = false;
            this.frame = 0;
            this.destroyed = false;
            this.events = new AbortController();
            this.originalRole = sidebar.getAttribute("role");
            this.originalLabel = sidebar.getAttribute("aria-label");

            const shell = document.createElement("div");
            shell.id = "lg-image-filter-control";
            const button = document.createElement("button");
            button.id = "lg-image-tools-fab";
            button.type = "button";
            button.setAttribute("aria-label", label);
            button.setAttribute("aria-controls", sidebar.id);
            button.setAttribute("aria-expanded", "false");
            button.innerHTML = icon;
            const text = document.createElement("span");
            text.className = "lg-image-filter-label";
            text.textContent = label;
            text.setAttribute("aria-hidden", "true");
            button.appendChild(text);
            const chevron = document.createElement("span");
            chevron.className = "lg-image-filter-chevron";
            chevron.setAttribute("aria-hidden", "true");
            button.appendChild(chevron);
            this.shell = shell;
            this.button = button;

            // Button first in tab order; visually it stays at the bottom anchor.
            shell.append(button, sidebar);
            document.body.appendChild(shell);
            sidebar.setAttribute("role", "group");
            sidebar.setAttribute("aria-label", label);
            this.syncState();

            const listen = (target, type, handler) =>
                target.addEventListener(type, handler, { signal: this.events.signal });
            listen(button, "click", () => {
                if (!this.open) closeTools();
                this.setOpen(!this.open);
            });
            listen(document, "pointerdown", event => {
                if (!shell.contains(event.target)) this.setOpen(false, false);
            });
            listen(document, "keydown", event => {
                if (event.key !== "Escape" || !this.open) return;
                event.preventDefault();
                this.setOpen(false);
            });
            listen(shell, "focusout", event => {
                if (event.relatedTarget && !shell.contains(event.relatedTarget)) {
                    this.setOpen(false, false);
                }
            });
            listen(sidebar, "keydown", event => this.navigateOptions(event));

            this.observer = new MutationObserver(() => {
                // Core re-pins this sidebar on search/resize. Keep the user's
                // disclosure state instead of unexpectedly opening the control.
                this.syncState();
                this.scheduleMeasure();
            });
            this.observer.observe(sidebar, {
                childList: true, subtree: true, attributes: true,
                attributeFilter: ["class", "aria-checked"],
            });
            this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure());
            this.resizeObserver.observe(sidebar);
            listen(window, "resize", () => this.updateViewport());
            if (window.visualViewport) {
                listen(window.visualViewport, "resize", () => this.updateViewport());
                listen(window.visualViewport, "scroll", () => this.updateViewport());
            }
            this.updateViewport();
        }

        setOpen(open, restoreFocus = true) {
            if (this.destroyed || this.open === open) return;
            if (!open && restoreFocus && this.shell.contains(document.activeElement)) {
                this.button.focus({ preventScroll: true });
            }
            // Measure before expanding: the content keeps its final width while
            // only its containing surface changes size. No text squashing/reflow.
            if (open) this.measure();
            this.open = open;
            this.syncState();
        }

        syncState() {
            if (this.destroyed) return;
            this.shell.classList.toggle("is-open", this.open);
            this.page.classList.toggle("lg-image-fab-open", this.open);
            if (this.sidebar.classList.contains("open") !== this.open) {
                this.sidebar.classList.toggle("open", this.open);
            }
            this.sidebar.inert = !this.open;
            this.sidebar.setAttribute("aria-hidden", String(!this.open));
            this.button.setAttribute("aria-expanded", String(this.open));
            document.querySelector(".degoog-img-sidebar-overlay")?.classList.remove("open");
            document.getElementById("results-layout")?.classList.remove("filters-open");
            this.syncRadioTabStops();
        }

        syncRadioTabStops() {
            this.sidebar.querySelectorAll('[role="radiogroup"]').forEach(group => {
                const options = [...group.querySelectorAll('[role="radio"]')];
                const selected = options.find(option => option.getAttribute("aria-checked") === "true") || options[0];
                options.forEach(option => { option.tabIndex = option === selected ? 0 : -1; });
            });
        }

        navigateOptions(event) {
            const option = event.target.closest?.('[role="radio"]');
            const group = option?.closest('[role="radiogroup"]');
            if (!group) return;
            const options = [...group.querySelectorAll('[role="radio"]')].filter(item => !item.disabled);
            const index = options.indexOf(option);
            let next;
            if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % options.length;
            if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (index + options.length - 1) % options.length;
            if (event.key === "Home") next = 0;
            if (event.key === "End") next = options.length - 1;
            if (next === undefined || !options[next]) return;
            event.preventDefault();
            options[next].focus({ preventScroll: true });
            options[next].click();
            options[next].scrollIntoView({ block: "nearest" });
        }

        update({ right }) {
            if (this.destroyed) return;
            // Core caches this node, detaches it on non-image tabs, then puts
            // it back in results-layout. Reclaim it only after core reattaches
            // it; rescuing a detached node would fight a search-type change.
            if (this.sidebar.isConnected && this.sidebar.parentNode !== this.shell) {
                this.shell.appendChild(this.sidebar);
            }
            this.shell.classList.toggle("anchor-right", right);
            this.syncState();
            this.scheduleMeasure();
        }

        updateViewport() {
            const viewport = window.visualViewport;
            const height = viewport?.height ?? window.innerHeight;
            const bottom = Math.max(0, window.innerHeight - height - (viewport?.offsetTop || 0));
            this.shell.style.setProperty("--lg-filter-viewport-width", `${document.documentElement.clientWidth}px`);
            this.shell.style.setProperty("--lg-filter-viewport-height", `${height}px`);
            this.shell.style.setProperty("--lg-filter-viewport-bottom", `${bottom}px`);
            this.scheduleMeasure();
        }

        scheduleMeasure() {
            if (this.destroyed || this.frame) return;
            this.frame = requestAnimationFrame(() => {
                this.frame = 0;
                this.measure();
            });
        }

        measure() {
            const height = Math.ceil(this.sidebar.getBoundingClientRect().height);
            if (height === this.contentHeight) return;
            this.contentHeight = height;
            this.shell.style.setProperty("--lg-filter-content-height", `${height}px`);
        }

        destroy() {
            this.destroyed = true;
            this.events.abort();
            this.observer.disconnect();
            this.resizeObserver.disconnect();
            cancelAnimationFrame(this.frame);
            this.sidebar.inert = false;
            this.sidebar.removeAttribute("aria-hidden");
            for (const [name, value] of [["role", this.originalRole], ["aria-label", this.originalLabel]]) {
                if (value === null) this.sidebar.removeAttribute(name);
                else this.sidebar.setAttribute(name, value);
            }
            this.sidebar.querySelectorAll('[role="radio"]').forEach(option => option.removeAttribute("tabindex"));
            // Core can detach its cached sidebar while switching search tabs.
            // Preserve that node and its handlers; never replace its innerHTML.
            if (this.sidebar.parentNode === this.shell) {
                document.getElementById("results-layout")?.appendChild(this.sidebar);
            }
            this.shell.remove();
        }
    }
    window.LgImageFilterControl = ImageFilterControl;
})();
