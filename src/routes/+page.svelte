<script lang="ts">
	import { onMount } from "svelte";
	import { appState } from "$lib/stores/app.svelte";
	import Titlebar from "$lib/components/Titlebar.svelte";
	import TilesContainer from "$lib/components/TilesContainer.svelte";
	import FullscreenView from "$lib/components/FullscreenView.svelte";
	import FloatingPopups from "$lib/components/FloatingPopups.svelte";
	import CollectionsPanel from "$lib/components/CollectionsPanel.svelte";
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import HelpPanel from "$lib/components/HelpPanel.svelte";

	onMount(async () => {
		await appState.init();
	});
</script>

<svelte:window onkeydown={(e) => appState.handleKeydown(e)} />

<div class="app-layout">
	<Titlebar />
	<div class="app-main">
		<TilesContainer />
	</div>
</div>

<FullscreenView />
<FloatingPopups />
<CollectionsPanel />
<ContextMenu />
<HelpPanel />
