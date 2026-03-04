<script lang="ts">
	import { appState } from "$lib/stores/app.svelte";
	import VideoTile from "./VideoTile.svelte";

	let container: HTMLDivElement;

	function onWheel(e: WheelEvent) {
		// If the user is already scrolling horizontally (trackpad), let it pass through.
		// Otherwise redirect vertical wheel delta to horizontal scroll.
		if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
		e.preventDefault();
		container.scrollLeft += e.deltaY;
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={container}
	class="tiles-container"
	onwheel={onWheel}
	onclick={() => appState.closeContextMenu()}
	oncontextmenu={(e) => {
		e.preventDefault();
		appState.closeContextMenu();
	}}
>
	<div class="tiles-wrapper">
		{#each appState.tiles as tile, index (tile.id)}
			<VideoTile {tile} {index} />
		{/each}
	</div>
</div>

<style>
	.tiles-container {
		overflow-x: auto;
		overflow-y: hidden;
		width: 100%;
		/* Ensure scroll snaps to the start/end padding so
		   the first and last tiles are never partially clipped */
		scroll-padding-inline: 8px;
	}

	.tiles-wrapper {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		/* Forces the wrapper to be exactly as wide as its children,
		   which is what enables scrolling to reach the very first tile */
		min-width: max-content;
		/* Padding keeps tile edges from being flush against the overflow
		   boundary — without this the first tile is clipped on the left
		   and the last on the right when at scroll extremes */
		padding: 0 8px;
		box-sizing: border-box;
	}
</style>
