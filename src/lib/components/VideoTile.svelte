<script lang="ts">
	import { appState } from "$lib/stores/app.svelte";
	import { Search, Settings, Plus, List } from "lucide-svelte";
	import type { Tile } from "$lib/types";
	let { tile = $bindable(), index }: { tile: Tile; index: number } = $props();
	let tileEl = $state<HTMLDivElement | null>(null);

	const currentItem = $derived(tile.queue[tile._currentIndex]);
	const itemZoom = $derived(currentItem?.zoom ?? 1);
	const itemZoomX = $derived(currentItem?.zoomX ?? 50);
	const itemZoomY = $derived(currentItem?.zoomY ?? 50);

	function handleTileClick(e: MouseEvent) {
		appState.selectTile(tile.id);
		appState.closeContextMenu();
	}
	function handleRightClick(e: MouseEvent) {
		e.preventDefault();
		appState.handleContextMenu(tile, e);
	}
	function openPopupFromBtn(
		type: "zoom" | "controls" | "queue",
		e: MouseEvent,
	) {
		e.stopPropagation();
		const el = (e.currentTarget as HTMLElement).closest(
			".video-tile",
		) as HTMLElement | null;
		const rect = el
			? el.getBoundingClientRect()
			: (e.currentTarget as HTMLElement).getBoundingClientRect();
		appState.openPopup(tile, type, rect);
	}

	function handleDragStart(e: DragEvent) {
		// Fix: supply a custom drag image anchored exactly where the user grabbed.
		// Without this, the browser renders the ghost from the element's top-left
		// corner. On edge tiles (first/last) this causes the ghost to drift up into
		// the titlebar area and visually "select" the title text and window buttons.
		if (tileEl && e.dataTransfer) {
			const rect = tileEl.getBoundingClientRect();

			// Clone off-screen so the browser can snapshot it for the ghost image
			const ghost = tileEl.cloneNode(true) as HTMLElement;
			ghost.style.cssText =
				"position:fixed;top:-9999px;left:-9999px;" +
				`width:${rect.width}px;height:${rect.height}px;` +
				"pointer-events:none;opacity:0.85;";
			document.body.appendChild(ghost);

			// Offset by grab position — ghost now tracks the cursor, not the tile corner
			e.dataTransfer.setDragImage(
				ghost,
				e.clientX - rect.left,
				e.clientY - rect.top,
			);

			// Remove clone right after the browser captures it for the ghost image
			requestAnimationFrame(() => {
				if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
			});
		}

		appState.handleDragStart(e, tile.id);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={tileEl}
	class="video-tile"
	class:selected={appState.selectedID === tile.id}
	class:video-tile-single={appState.tiles.length === 1}
	onclick={handleTileClick}
	oncontextmenu={handleRightClick}
	draggable="true"
	ondragstart={handleDragStart}
	ondragover={(e) => appState.handleDragOver(e)}
	ondrop={(e) => appState.handleDrop(e, tile.id)}
>
	{#if tile.queue.length === 0}
		<div class="empty-placeholder">
			<div class="empty-icon"><Plus size={24} /></div>
			<div>Drop videos or click settings</div>
		</div>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="video-zoom-wrapper"
			style="transform: scale({itemZoom}); transform-origin: {itemZoomX}% {itemZoomY}%;"
			oncontextmenu={(e) => e.preventDefault()}
		>
			<video
				src={currentItem?.url ?? undefined}
				class="video-element"
				loop={tile.settings.repeat === "One"}
				onloadedmetadata={(e) => appState.handleVideoMetadata(e, tile)}
				onended={() => appState.handleVideoEnded(tile)}
				oncontextmenu={(e) => e.preventDefault()}
				muted
				playsinline
			></video>
		</div>
	{/if}
	{#if tile.queue.length > 0}
		<div class="queue-indicator">
			{tile._currentIndex + 1} / {tile.queue.length}
		</div>
	{/if}
	{#if tile.queue.length > 0 && itemZoom > 1}
		<div class="zoom-indicator">
			{Math.round(itemZoom * 100)}%
		</div>
	{/if}
	{#if tile._videoWarning}
		<div class="aspect-warning">{tile._videoWarning}</div>
	{/if}
	{#if !appState.lock && !appState.isDesktop}
		<div class="tile-action-btns">
			{#if tile.queue.length > 0}
				<button
					class="tile-action-btn"
					class:tile-action-btn-active={appState.hasPopup(tile.id, "queue")}
					title="Queue"
					onclick={(e) => openPopupFromBtn("queue", e)}
				>
					<List size={14} strokeWidth={2.5} />
				</button>
			{/if}
			<button
				class="tile-action-btn"
				class:tile-action-btn-active={appState.hasPopup(tile.id, "zoom") ||
					itemZoom > 1}
				title="Zoom"
				onclick={(e) => openPopupFromBtn("zoom", e)}
			>
				<Search size={14} strokeWidth={2.5} />
			</button>
			<button
				class="tile-action-btn"
				class:tile-action-btn-active={appState.hasPopup(tile.id, "controls")}
				title="Settings"
				onclick={(e) => openPopupFromBtn("controls", e)}
			>
				<Settings size={14} strokeWidth={2.5} />
			</button>
		</div>
	{/if}
</div>
