<script lang="ts">
	import { appState } from "$lib/stores/app.svelte";

	const objectFit = $derived(appState.tiles.length === 3 ? "cover" : "contain");
</script>

<div
	id="fullscreen-container"
	class="fullscreen-container"
	style={appState.isFS ? "" : "display:none;"}
>
	{#each appState.tiles as tile (tile.id)}
		<div class="video-tile-fs">
			{#if tile.queue.length > 0}
				{@const currentItem = tile.queue[tile._currentIndex]}
				<div
					class="video-zoom-wrapper"
					style="transform: scale({currentItem?.zoom ??
						tile.settings.zoom ??
						1}); transform-origin: {currentItem?.zoomX ??
						tile.settings.zoomX ??
						50}% {currentItem?.zoomY ?? tile.settings.zoomY ?? 50}%;"
				>
					<video
						src={currentItem?.url ?? undefined}
						class="video-element"
						style="object-fit: {objectFit};"
						loop={tile.settings.repeat === "One"}
						onended={() => appState.handleVideoEnded(tile)}
						muted
						playsinline
					></video>
				</div>
			{/if}
		</div>
	{/each}
</div>
