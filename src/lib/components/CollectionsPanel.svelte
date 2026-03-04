<script lang="ts">
	import { appState } from '$lib/stores/app.svelte';
</script>

{#if appState.showCollectionsPanel}
	<div
		class="modal-overlay"
		onclick={() => (appState.showCollectionsPanel = false)}
		onkeydown={(e) => { if (e.key === 'Escape') appState.showCollectionsPanel = false; }}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<div class="modal-panel" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Collections</h2>
				<button class="btn-close" onclick={() => (appState.showCollectionsPanel = false)}>&times;</button>
			</div>

			<div class="modal-content">
				<div class="modal-actions">
					{#if !appState.collPanel.showNew}
						<button class="btn btn-primary" onclick={() => appState.collShowNewForm()}>+ New Collection</button>
					{/if}
					<button class="btn btn-secondary" onclick={() => appState.exportToJSON()}>Export JSON</button>
					<label class="btn btn-secondary" title="Import a previously exported JSON file">
						Import JSON
						<input
							type="file"
							accept=".json"
							onchange={(e) => { appState.importProcessFile((e.target as HTMLInputElement).files?.[0] ?? null); (e.target as HTMLInputElement).value = ''; }}
							hidden
						/>
					</label>
				</div>

				{#if appState.collPanel.showNew}
					<div class="new-item-form">
						<input
							id="coll-new-input"
							type="text"
							bind:value={appState.collPanel.newName}
							onkeydown={(e) => { if (e.key === 'Enter' && appState.collPanel.newName.trim()) appState.collSubmitNew(); if (e.key === 'Escape') appState.collCancelNew(); }}
							placeholder="Collection name…"
							class="panel-input"
							maxlength="80"
						/>
						<div class="new-item-actions">
							<button
								class="btn btn-primary btn-mini"
								disabled={!appState.collPanel.newName.trim()}
								onclick={() => appState.collSubmitNew()}
							>Create</button>
							<button class="btn btn-mini" onclick={() => appState.collCancelNew()}>Cancel</button>
						</div>
					</div>
				{/if}

				<div class="list-container">
					{#each appState.collections as collection (collection.id)}
						<div class="list-item" class:active={appState.currentCollectionId === collection.id}>

							{#if appState.collPanel.renamingId !== collection.id && appState.collPanel.confirmId !== collection.id}
								<div class="list-item-row">
									<div
										class="list-item-info"
										onclick={() => appState.switchCollection(collection.id)}
										title="Switch to this collection"
										role="button"
										tabindex="0"
										onkeydown={(e) => { if (e.key === 'Enter') appState.switchCollection(collection.id); }}
									>
										<div class="list-item-name">{collection.name}</div>
										<div class="list-item-meta">
											{collection.tiles?.length || 0}
											{(collection.tiles?.length || 0) === 1 ? 'tile' : 'tiles'}
										</div>
									</div>
									<div class="list-item-actions">
										<button
											class="btn-icon-small"
											onclick={(e) => { e.stopPropagation(); appState.collStartRename(collection.id, collection.name); }}
											title="Rename"
										>✎</button>
										<button
											class="btn-icon-small"
											onclick={(e) => { e.stopPropagation(); appState.duplicateCollection(collection.id); }}
											title="Duplicate"
										>❐</button>
										{#if appState.collections.length > 1}
											<button
												class="btn-icon-small btn-danger"
												onclick={(e) => { e.stopPropagation(); appState.collStartConfirmDelete(collection.id); }}
												title="Delete"
											>&times;</button>
										{/if}
									</div>
								</div>

							{:else if appState.collPanel.renamingId === collection.id}
								<div class="list-item-edit-row">
									<input
										id="coll-rename-{collection.id}"
										type="text"
										bind:value={appState.collPanel.renameVal}
										onkeydown={(e) => { if (e.key === 'Enter' && appState.collPanel.renameVal.trim()) appState.collCommitRename(); if (e.key === 'Escape') appState.collCancelRename(); }}
										class="panel-input panel-input-sm"
										maxlength="80"
									/>
									<div class="edit-row-actions">
										<button
											class="btn btn-mini btn-primary"
											disabled={!appState.collPanel.renameVal.trim()}
											onclick={(e) => { e.stopPropagation(); appState.collCommitRename(); }}
											title="Save"
										>✓</button>
										<button
											class="btn btn-mini"
											onclick={(e) => { e.stopPropagation(); appState.collCancelRename(); }}
											title="Cancel"
										>✕</button>
									</div>
								</div>

							{:else if appState.collPanel.confirmId === collection.id}
								<div class="list-item-confirm-row">
									<span class="confirm-label">Delete "{collection.name}"?</span>
									<div class="confirm-actions">
										<button
											class="btn btn-mini btn-danger"
											onclick={(e) => { e.stopPropagation(); appState.deleteCollection(collection.id); }}
										>Delete</button>
										<button
											class="btn btn-mini"
											onclick={(e) => { e.stopPropagation(); appState.collCancelDelete(); }}
										>Cancel</button>
									</div>
								</div>
							{/if}

						</div>
					{/each}
				</div>
			</div>

			<div class="modal-footer">
				<button
					class="btn btn-danger btn-mini"
					onclick={() => { if (confirm('Clear ALL data and reload?')) appState.handleClearDB(); }}
				>Clear All Data</button>
			</div>
		</div>
	</div>
{/if}

{#if appState.importPanel.show}
	<div class="modal-overlay" style="z-index: 210;" onclick={(e) => e.stopPropagation()}>
		<div class="modal-panel" style="max-width: 400px;" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Import Project</h2>
				<button class="btn-close" onclick={() => appState.importHidePanel()}>&times;</button>
			</div>

			<div class="modal-content">
				{#if appState.importPanel.error}
					<div class="import-error">
						<p style="color: var(--accent-rose); font-weight: 600; font-size: 0.8125rem;">Import Error</p>
						<p style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 0.25rem;">{appState.importPanel.error}</p>
					</div>
				{/if}

				{#if appState.importPanel.info && !appState.importPanel.error}
					<div>
						<div class="import-summary">
							<div class="import-summary-row">
								<span class="import-summary-label">Format version</span>
								<span class="import-summary-value">{appState.importPanel.info.version}</span>
							</div>
							<div class="import-summary-row">
								<span class="import-summary-label">Collections</span>
								<span class="import-summary-value">{appState.importPanel.info.totalCollections}</span>
							</div>
							<div class="import-summary-row">
								<span class="import-summary-label">Tiles</span>
								<span class="import-summary-value">{appState.importPanel.info.totalTiles}</span>
							</div>
							{#if appState.importPanel.info.hasMediaMap}
								<div class="import-summary-row">
									<span class="import-summary-label">Media map</span>
									<span class="import-summary-value" style="color: var(--accent-emerald);">Yes — URLs will be restored</span>
								</div>
							{/if}
						</div>

						<div class="import-mode-group">
							<p style="font-size: 0.75rem; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.5rem;">Import Mode</p>

							<label class="import-mode-option" class:active={appState.importPanel.mode === 'replace'}>
								<input type="radio" value="replace" bind:group={appState.importPanel.mode} style="display: none;" />
								<span class="import-mode-radio" class:checked={appState.importPanel.mode === 'replace'}></span>
								<span>
									<strong>Replace</strong>
									<small style="display: block; color: var(--text-tertiary); font-size: 0.75rem;">Remove all existing data and import fresh</small>
								</span>
							</label>

							<label class="import-mode-option" class:active={appState.importPanel.mode === 'merge'}>
								<input type="radio" value="merge" bind:group={appState.importPanel.mode} style="display: none;" />
								<span class="import-mode-radio" class:checked={appState.importPanel.mode === 'merge'}></span>
								<span>
									<strong>Merge</strong>
									<small style="display: block; color: var(--text-tertiary); font-size: 0.75rem;">Add imported collections alongside existing ones</small>
								</span>
							</label>
						</div>
					</div>
				{/if}
			</div>

			<div class="modal-footer" style="gap: 0.5rem;">
				<button class="btn btn-mini" onclick={() => appState.importHidePanel()}>Cancel</button>
				{#if !appState.importPanel.error}
					<button
						class="btn btn-primary btn-mini"
						disabled={!appState.importPanel.parsedData}
						onclick={() => appState.importExecute()}
					>Import</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
