<script lang="ts">
	import { appState } from '$lib/stores/app.svelte';
</script>

{#if !appState.isFS}
	<button
		class="help-button"
		onclick={() => (appState.showKeyboard = !appState.showKeyboard)}
	>?</button>
{/if}

{#if appState.showKeyboard}
	<div class="shortcuts-panel">
		<h3>Keyboard Shortcuts</h3>
		<div class="shortcut">
			<kbd>Space</kbd>
			<span>Play/Pause</span>
		</div>
		<div class="shortcut">
			<kbd>F</kbd>
			<span>Fullscreen</span>
		</div>
		<div class="shortcut">
			<kbd>L</kbd>
			<span>Lock/Unlock</span>
		</div>
		{#if !appState.lock}
			<div class="shortcut">
				<kbd>S</kbd>
				<span>Toggle Shuffle</span>
			</div>
			<div class="shortcut">
				<kbd>R</kbd>
				<span>Cycle Repeat</span>
			</div>
		{/if}
	</div>
{/if}
