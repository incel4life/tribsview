<script lang="ts">
	import { appState } from "$lib/stores/app.svelte";
	import { Settings, X } from "lucide-svelte";
	import type { Tile, Popup } from "$lib/types";

	let {
		tile,
		tileIndex,
		popup,
	}: { tile: Tile; tileIndex: number; popup: Popup } = $props();
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
		<Settings size={12} strokeWidth={2.5} />
		Settings
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

<div class="popup-section">
	<label class="file-upload-btn">
		Upload Videos
		<input
			type="file"
			multiple
			accept="video/*"
			onchange={(e) => {
				appState.handleFileUpload((e.target as HTMLInputElement).files, tile);
				(e.target as HTMLInputElement).value = "";
			}}
			hidden
		/>
	</label>
	<div class="url-group">
		<div class="url-input-wrapper">
			<input
				type="text"
				bind:value={tile._urlInput}
				onkeydown={(e) => {
					if (e.key === "Enter") appState.addUrlToTile(tile);
				}}
				placeholder="TikTok, Instagram, X, etc... or direct video URL…"
				class="url-input"
				disabled={tile._urlResolving}
			/>
			{#if tile._urlResolving}
				<span
					class="url-spinner"
					title={tile._urlCobaltStatus ?? "Downloading…"}
				></span>
			{/if}
		</div>
		<button
			class="btn"
			onclick={() => appState.addUrlToTile(tile)}
			disabled={tile._urlResolving || !tile._urlInput.trim()}>Add</button
		>
	</div>

	{#if tile._urlResolving && tile._urlCobaltStatus}
		<p class="url-hint url-hint--status">{tile._urlCobaltStatus}</p>
	{:else if tile._videoWarning}
		<p class="url-hint url-hint--warning">{tile._videoWarning}</p>
	{:else}
		<p class="url-hint">
			Supports TikTok, X, Instagram, etc... and direct video URLs
		</p>
	{/if}
</div>

{#if !appState.lock}
	<div class="popup-section">
		<div class="toggle-group">
			<button
				class="toggle-btn"
				class:active={tile.settings.shuffle}
				onclick={() => {
					tile.settings.shuffle = !tile.settings.shuffle;
				}}>Shuffle</button
			>
			<button
				class="toggle-btn"
				class:active={tile.settings.repeat !== "None"}
				onclick={() => appState.cycleRepeat(tile)}
				>Repeat: {tile.settings.repeat}</button
			>
		</div>
	</div>
{/if}

<div class="popup-footer">
	{#if tileIndex > 0 && !appState.lock}
		<button
			class="btn btn-mini"
			onclick={(e) => {
				e.stopPropagation();
				appState.moveTileLeft(tileIndex);
			}}>← Left</button
		>
	{/if}
	{#if tileIndex < appState.tiles.length - 1 && !appState.lock}
		<button
			class="btn btn-mini"
			onclick={(e) => {
				e.stopPropagation();
				appState.moveTileRight(tileIndex);
			}}>Right →</button
		>
	{/if}
	<button
		class="btn btn-mini btn-danger"
		onclick={(e) => {
			e.stopPropagation();
			appState.removeTile(tile.id);
			appState.closePopup(popup.id);
		}}>Remove</button
	>
	<button
		class="btn btn-mini"
		onclick={(e) => {
			e.stopPropagation();
			appState.closePopup(popup.id);
		}}>Close</button
	>
</div>
