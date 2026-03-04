<script lang="ts">
	import { appState } from "$lib/stores/app.svelte";
	import ZoomPanel from "./ZoomPanel.svelte";
	import TileControls from "./TileControls.svelte";
	import QueuePanel from "./QueuePanel.svelte";
</script>

{#each appState.popups as popup (popup.id)}
	{@const tileIndex = appState.tiles.findIndex((t) => t.id === popup.tileId)}
	{#if tileIndex !== -1}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="floating-popup"
			style={appState.getPopupPositionStyle(popup)}
			onclick={(e) => e.stopPropagation()}
		>
			<div class="popup-inner">
				{#if popup.type === "zoom"}
					<ZoomPanel bind:tile={appState.tiles[tileIndex]} {popup} />
				{:else if popup.type === "controls"}
					<TileControls
						bind:tile={appState.tiles[tileIndex]}
						{tileIndex}
						{popup}
					/>
				{:else if popup.type === "queue"}
					<QueuePanel bind:tile={appState.tiles[tileIndex]} {popup} />
				{/if}
			</div>
			<div
				class="popup-resize-handle"
				onmousedown={(e) => {
					e.preventDefault();
					e.stopPropagation();
					const el = (e.currentTarget as HTMLElement).closest(
						".floating-popup",
					) as HTMLElement | null;
					appState.startPopupResize(popup, e, el);
				}}
				title="Drag to resize"
			></div>
		</div>
	{/if}
{/each}
