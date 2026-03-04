<script lang="ts">
	import { appState } from "$lib/stores/app.svelte";
	import { formatDuration } from "$lib/utils/format";
	import {
		List,
		X,
		Play,
		Shuffle,
		Repeat,
		Repeat1,
		Link,
		HardDrive,
		Trash2,
	} from "lucide-svelte";
	import type { Tile, Popup } from "$lib/types";

	let { tile = $bindable(), popup }: { tile: Tile; popup: Popup } = $props();

	const totalDuration = $derived(
		tile.queue.reduce((acc, item) => acc + (item.duration || 0), 0),
	);
	const repeatIcon = $derived(
		tile.settings.repeat === "One" ? Repeat1 : Repeat,
	);
	const repeatActive = $derived(tile.settings.repeat !== "None");
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
		<List size={12} strokeWidth={2.5} />
		Queue
		<span class="queue-title-meta"
			>{tile._currentIndex + 1} / {tile.queue.length}</span
		>
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

<!-- Status bar: total duration + shuffle/repeat toggles -->
<div class="queue-statusbar">
	<span class="queue-total-duration">{formatDuration(totalDuration)} total</span
	>
	<div class="queue-statusbar-actions">
		<button
			class="queue-status-btn"
			class:queue-status-btn-active={tile.settings.shuffle}
			title="Shuffle"
			onclick={() => {
				tile.settings.shuffle = !tile.settings.shuffle;
			}}
		>
			<Shuffle size={11} strokeWidth={2.5} />
		</button>
		<button
			class="queue-status-btn"
			class:queue-status-btn-active={repeatActive}
			title="Repeat: {tile.settings.repeat}"
			onclick={() => appState.cycleRepeat(tile)}
		>
			<svelte:component this={repeatIcon} size={11} strokeWidth={2.5} />
			{#if repeatActive}
				<span class="queue-status-label">{tile.settings.repeat}</span>
			{/if}
		</button>
	</div>
</div>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="queue-list">
	{#each tile.queue as item, idx (idx)}
		<div
			class="queue-item"
			class:active={idx === tile._currentIndex}
			onclick={() => (tile._currentIndex = idx)}
		>
			<!-- Playing indicator or index number -->
			<div class="queue-number">
				{#if idx === tile._currentIndex}
					<Play size={10} strokeWidth={2.5} />
				{:else}
					{idx + 1}
				{/if}
			</div>

			<!-- Thumbnail -->
			{#if item.thumbnail}
				<img src={item.thumbnail} class="queue-thumb" alt="" />
			{:else}
				<div class="queue-thumb queue-thumb-placeholder"></div>
			{/if}

			<!-- Info -->
			<div class="queue-info">
				<div class="queue-name" title={item.name}>{item.name}</div>
				<div class="queue-meta-row">
					<span class="queue-duration">{formatDuration(item.duration)}</span>
					{#if item.source === "url"}
						<span class="queue-source-badge" title={item.via ?? item.url ?? ""}>
							<Link size={9} />
							{item.via ?? "url"}
						</span>
					{:else}
						<span class="queue-source-badge">
							<HardDrive size={9} />
							file
						</span>
					{/if}
				</div>
			</div>

			<!-- Remove -->
			<div class="queue-actions">
				<button
					class="btn-icon-small btn-danger"
					title="Remove"
					onclick={(e) => {
						e.stopPropagation();
						appState.removeFromQueue(tile, idx);
					}}
				>
					<X size={12} />
				</button>
			</div>
		</div>
	{/each}

	{#if tile.queue.length === 0}
		<div class="queue-empty">No videos in queue</div>
	{/if}
</div>

{#if tile.queue.length > 0}
	<div class="popup-footer">
		<button
			class="btn btn-mini btn-danger"
			onclick={(e) => {
				e.stopPropagation();
				while (tile.queue.length > 0) appState.removeFromQueue(tile, 0);
			}}
		>
			<Trash2 size={11} />
			Clear all
		</button>
	</div>
{/if}

<style>
	.queue-title-meta {
		font-size: 10px;
		font-weight: 400;
		color: var(--text-tertiary);
		text-transform: none;
		letter-spacing: 0;
		margin-left: 2px;
	}

	.queue-statusbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 5px 12px;
		border-bottom: 1px solid var(--border-light);
		background: var(--dc-bg-floating);
	}

	.queue-total-duration {
		font-size: 11px;
		color: var(--text-tertiary);
	}

	.queue-statusbar-actions {
		display: flex;
		gap: 4px;
		align-items: center;
	}

	.queue-status-btn {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 3px 6px;
		border: none;
		border-radius: 3px;
		background: transparent;
		color: var(--dc-interactive-muted);
		font-size: 11px;
		font-family: inherit;
		cursor: pointer;
		transition:
			background 0.1s,
			color 0.1s;
	}

	.queue-status-btn:hover {
		background: var(--dc-bg-modifier-hover);
		color: var(--dc-interactive-hover);
	}

	.queue-status-btn-active {
		color: var(--dc-blurple);
	}

	.queue-status-btn-active:hover {
		background: var(--dc-bg-modifier-hover);
		color: var(--dc-blurple);
	}

	.queue-status-label {
		font-size: 10px;
		font-weight: 600;
	}

	.queue-thumb-placeholder {
		background: var(--dc-bg-3);
		flex-shrink: 0;
	}

	.queue-meta-row {
		display: flex;
		align-items: center;
		gap: 5px;
		margin-top: 1px;
	}

	.queue-source-badge {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-size: 10px;
		color: var(--text-tertiary);
		background: var(--dc-bg-3);
		border-radius: 2px;
		padding: 0 4px;
		line-height: 14px;
		max-width: 60px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.queue-empty {
		padding: 24px 12px;
		text-align: center;
		font-size: 12px;
		color: var(--text-tertiary);
	}
</style>
