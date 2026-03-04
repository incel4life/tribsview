<script lang="ts">
	import { appState } from "$lib/stores/app.svelte";
	import { Settings, Search, List, Trash2 } from "lucide-svelte";
</script>

{#if appState.contextMenu.visible}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	{#if !appState.lock}
		<div
			class="context-menu"
			style="left: {appState.contextMenu.x}px; top: {appState.contextMenu.y}px;"
			onclick={(e) => e.stopPropagation()}
		>
			<button
				class="context-menu-item"
				onclick={() => appState.handleContextMenuAction("settings")}
			>
				<span class="context-menu-icon">
					<Settings size={14} />
				</span>
				Settings
			</button>
			<button
				class="context-menu-item"
				onclick={() => appState.handleContextMenuAction("zoom")}
			>
				<span class="context-menu-icon">
					<Search size={14} />
				</span>
				Zoom
			</button>
			{#if (appState.contextMenu.tile?.queue.length ?? 0) > 0}
				<button
					class="context-menu-item"
					onclick={() => appState.handleContextMenuAction("queue")}
				>
					<span class="context-menu-icon">
						<List size={14} />
					</span>
					Queue ({appState.contextMenu.tile?.queue.length})
				</button>
			{/if}
			<div class="context-menu-divider"></div>
			<button
				class="context-menu-item danger"
				onclick={() => appState.handleContextMenuAction("delete")}
			>
				<span class="context-menu-icon">
					<Trash2 size={14} />
				</span>
				Delete Tile
			</button>
		</div>
	{/if}
{/if}
