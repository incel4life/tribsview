<script lang="ts">
	import { appState } from "$lib/stores/app.svelte";
	import {
		Lock,
		LockOpen,
		Pause,
		Play,
		LayoutGrid,
		Plus,
		Minus,
		Maximize2,
		X,
		HandCoins,
		Shell,
	} from "lucide-svelte";
	// import { shell } from "electron";

	const isElectron =
		typeof window !== "undefined" && !!window.electronAPI?.isElectron;
</script>

<div class="titlebar">
	<!--
		user-select: none prevents the browser from highlighting the title text
		or button labels when a tile drag ghost is created near the top of the
		window (the first/last tile drag glitch).
	-->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="titlebar-drag"
		style="user-select: none; -webkit-user-select: none;"
	>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<h1 class="titlebar-title">tribsview</h1>
	</div>
	<div
		class="titlebar-controls"
		style="user-select: none; -webkit-user-select: none;"
	>
		{#if !appState.lock}
			<button
				onclick={() => open("https://ko-fi.com/incel4life")}
				class="btn btn-primary"
			>
				<HandCoins size={14} />
				Donate
			</button>
		{/if}
		<button
			onclick={() => (appState.showCollectionsPanel = true)}
			class="btn btn-secondary"
		>
			<LayoutGrid size={14} />
			Collections
		</button>
		{#if !appState.lock}
			<button onclick={() => appState.addTile()} class="btn btn-primary">
				<Plus size={14} />
				Tile
			</button>
		{/if}
		<button
			onclick={() => appState.toggleLock()}
			class="btn"
			class:btn-active={appState.lock}
		>
			{#if appState.lock}
				<Lock size={14} /> Locked
			{:else}
				<LockOpen size={14} /> Unlocked
			{/if}
		</button>
		<button onclick={() => appState.togglePlay()} class="btn btn-primary">
			{#if appState.isPlay}
				<Pause size={14} /> Pause
			{:else}
				<Play size={14} /> Play
			{/if}
		</button>
		{#if isElectron}
			<div class="titlebar-window-controls">
				<button
					class="titlebar-btn"
					onclick={() => window.electronAPI?.minimizeWindow()}
					title="Minimize"
				>
					<Minus size={12} />
				</button>
				<button
					class="titlebar-btn"
					onclick={() => window.electronAPI?.maximizeWindow()}
					title="Maximize"
				>
					<Maximize2 size={12} />
				</button>
				<button
					class="titlebar-btn titlebar-btn-close"
					onclick={() => window.electronAPI?.closeWindow()}
					title="Close"
				>
					<X size={12} />
				</button>
			</div>
		{/if}
	</div>
</div>
