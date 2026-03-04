<script lang="ts">
	import { appState } from "$lib/stores/app.svelte";
	import { Search, X } from "lucide-svelte";
	import type { Tile, Popup } from "$lib/types";
	let { tile = $bindable(), popup }: { tile: Tile; popup: Popup } = $props();

	const currentItem = $derived(tile.queue[tile._currentIndex]);
	const itemZoom = $derived(currentItem?.zoom ?? 1);
	const itemZoomX = $derived(currentItem?.zoomX ?? 50);
	const itemZoomY = $derived(currentItem?.zoomY ?? 50);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="popup-header"
	onmousedown={(e) => {
		e.preventDefault();
		appState.startPopupDrag(popup, e);
	}}
	style="cursor: grab;"
>
	<div class="popup-title">
		<Search size={12} strokeWidth={2.5} />
		Zoom
		<span class="popup-drag-hint">drag</span>
	</div>
	<button
		class="btn-close"
		onclick={(e) => {
			e.stopPropagation();
			appState.closePopup(popup.id);
		}}
	>
		<X size={12} />
	</button>
</div>

{#if currentItem}
	<!-- Current video label -->
	{#if tile.queue.length > 1}
		<div class="zoom-video-label">
			<span class="zoom-video-index"
				>{tile._currentIndex + 1}/{tile.queue.length}</span
			>
			<span class="zoom-video-name" title={currentItem.name}
				>{currentItem.name}</span
			>
		</div>
	{/if}

	<div class="popup-section">
		<div class="zoom-row">
			<input
				type="range"
				min="1"
				max="3"
				step="0.05"
				value={itemZoom}
				oninput={(e) =>
					appState.setZoom(tile, (e.target as HTMLInputElement).value)}
				class="zoom-slider"
			/>
			<input
				type="number"
				class="zoom-pct-input"
				placeholder={String(Math.round(itemZoom * 100))}
				min="100"
				max="300"
				step="5"
				onchange={(e) => {
					appState.applyZoomPercent(tile, (e.target as HTMLInputElement).value);
					(e.target as HTMLInputElement).value = "";
				}}
				onkeydown={(e) => {
					if (e.key === "Enter") {
						appState.applyZoomPercent(
							tile,
							(e.target as HTMLInputElement).value,
						);
						(e.target as HTMLInputElement).value = "";
						(e.target as HTMLInputElement).blur();
					}
				}}
			/>
			<span class="zoom-pct-unit">%</span>
		</div>
	</div>
	<div class="popup-divider"><span>Focus Point</span></div>
	<div class="popup-section">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="zoom-preview-canvas"
			style={tile._videoWidth && tile._videoHeight
				? `--preview-ar: ${tile._videoWidth} / ${tile._videoHeight};`
				: ""}
			onclick={(e) => appState.setZoomOrigin(tile, e)}
			onwheel={(e) => {
				e.preventDefault();
				appState.handleZoomScroll(tile, e);
			}}
			onmousemove={(e) => {
				tile._zoomHover = {
					x: (e.offsetX / (e.currentTarget as HTMLElement).clientWidth) * 100,
					y: (e.offsetY / (e.currentTarget as HTMLElement).clientHeight) * 100,
				};
			}}
			onmouseleave={() => {
				tile._zoomHover = null;
			}}
		>
			{#if currentItem.url}
				<video
					src={currentItem.url}
					class="zoom-preview-video"
					muted
					playsinline
				></video>
			{/if}
			<div
				class="zoom-viewport-box"
				style={appState.getZoomViewportStyle(tile)}
			></div>
			{#if tile._zoomHover}
				<div class="zoom-crosshair-h" style="top: {tile._zoomHover.y}%"></div>
				<div class="zoom-crosshair-v" style="left: {tile._zoomHover.x}%"></div>
			{/if}
			<div
				class="zoom-origin-dot"
				style="left: {itemZoomX}%; top: {itemZoomY}%;"
			></div>
		</div>
		<p class="zoom-preview-hint">Click to set focus · Scroll to zoom</p>
	</div>
	<div class="popup-footer">
		<button
			class="btn btn-mini btn-secondary"
			onclick={(e) => {
				e.stopPropagation();
				appState.resetZoom(tile);
			}}>Reset</button
		>
		<button
			class="btn btn-mini btn-secondary"
			onclick={(e) => {
				e.stopPropagation();
				appState.setZoomOrigin(tile, null, 50, 50);
			}}>Center</button
		>
		<button
			class="btn btn-mini btn-primary"
			onclick={(e) => {
				e.stopPropagation();
				appState.closePopup(popup.id);
			}}>Done</button
		>
	</div>
{:else}
	<div class="zoom-empty">No video loaded</div>
{/if}

<style>
	.zoom-video-label {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 12px;
		border-bottom: 1px solid var(--border-light);
		background: var(--dc-bg-floating);
	}

	.zoom-video-index {
		font-size: 10px;
		font-weight: 700;
		color: var(--dc-blurple);
		background: rgba(88 101 242 / 0.15);
		border-radius: 3px;
		padding: 1px 5px;
		flex-shrink: 0;
	}

	.zoom-video-name {
		font-size: 11px;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.zoom-empty {
		padding: 24px 12px;
		text-align: center;
		font-size: 12px;
		color: var(--text-tertiary);
	}
</style>
