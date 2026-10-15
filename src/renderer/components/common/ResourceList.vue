<template>
  <div class="resource-list">
    <table>
      <colgroup><col v-if="showSelectionMark" class="resource-col-mark" /><col class="resource-col-name" /><col class="resource-col-category" /><col /><col class="resource-col-meta" /><col class="resource-col-action" /></colgroup>
      <thead><tr><th v-if="showSelectionMark"></th><th>{{ nameLabel }}</th><th>分类</th><th>{{ summaryLabel }}</th><th>{{ metaLabel }}</th><th>操作</th></tr></thead>
      <tbody>
        <template v-for="(item, index) in items" :key="item.key">
          <tr v-if="grouped && (index === 0 || items[index - 1].category !== item.category)" class="resource-group-row"><td :colspan="showSelectionMark ? 6 : 5">{{ item.category }}</td></tr>
          <tr :class="{ 'is-selected': item.key === selectedKey }" tabindex="0" :aria-selected="item.key === selectedKey" @click="$emit('select', item.raw)" @keydown.enter.prevent="$emit('select', item.raw)" @keydown.space.prevent="$emit('select', item.raw)">
            <td v-if="showSelectionMark"><span class="resource-row-mark" :class="{ 'is-checked': item.key === selectedKey }"><i v-if="item.key === selectedKey" class="fa-solid fa-check" aria-hidden="true"></i></span></td>
            <td><div class="resource-row-name"><span class="resource-icon" :style="{ background: item.color || '#2463eb' }"><i :class="item.icon" aria-hidden="true"></i></span><span class="resource-row-label" :title="item.name"><strong>{{ item.name }}</strong><small v-if="item.subtitle">{{ item.subtitle }}</small></span></div></td>
            <td><span class="resource-tag" :title="item.category">{{ item.category }}</span></td>
            <td><p class="resource-row-summary" :title="item.summary">{{ item.summary || '暂无简介' }}</p></td>
            <td class="resource-row-meta">{{ item.meta || '—' }}</td>
            <td><button type="button" class="resource-row-more" :aria-label="`${item.name}的操作`" @click.stop="$emit('action', item.raw)"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button></td>
          </tr>
        </template>
      </tbody>
    </table>
    <div v-if="!items.length" class="resource-empty"><i class="fa-regular fa-folder-open" aria-hidden="true"></i><p>暂无匹配的内容</p></div>
  </div>
</template>

<script setup>
defineProps({ items: { type: Array, default: () => [] }, selectedKey: { type: String, default: '' }, showSelectionMark: { type: Boolean, default: true }, grouped: Boolean, nameLabel: { type: String, default: '名称' }, metaLabel: { type: String, default: '版本' }, summaryLabel: { type: String, default: '简介' } });
defineEmits(['select', 'action']);
</script>

<style scoped>
.resource-row-label { display:flex; flex-direction:column; gap:4px; min-width:0; }
.resource-row-label strong { font-weight:inherit; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.resource-row-label small { color:#9aa7ba; font-size:10px; font-weight:400; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
</style>
