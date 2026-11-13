<template>
  <span class="app-avatar" :style="{ width: size + 'px', height: size + 'px', background: p.accent }" :title="app?.name">
    <img v-if="app?.avatar" :src="app.avatar" :alt="app?.name || ''" />
    <svg v-else viewBox="0 0 100 100" aria-hidden="true">
      <!-- 后发 -->
      <path v-if="p.hair === 'long'" :fill="p.hairColor" d="M24 46c0-20 12-31 26-31s26 11 26 31v34H24z" />
      <path v-else-if="p.hair === 'bob'" :fill="p.hairColor" d="M26 46c0-19 11-29 24-29s24 10 24 29v18H26z" />
      <circle v-if="p.hair === 'bun'" :fill="p.hairColor" cx="50" cy="15" r="9" />
      <!-- 身体 -->
      <path :fill="p.outfit" d="M14 104c0-18 15-28 36-28s36 10 36 28z" />
      <path fill="#fff" opacity=".9" d="M42 76l8 10 8-10z" />
      <path v-if="p.accessory === 'tie'" fill="#0f172a" opacity=".75" d="M48 82h4l2 14-4 4-4-4z" />
      <!-- 白大褂翻领 + 听诊器 -->
      <g v-if="p.accessory === 'stethoscope'">
        <path fill="#0f766e" d="M42 76l8 10 8-10 4 2-12 16-12-16z" />
        <path fill="none" stroke="#334155" stroke-width="2.4" stroke-linecap="round" d="M40 78c-3 8-2 15 4 18m16-18c3 8 2 15-4 18" />
        <circle fill="#94a3b8" stroke="#334155" stroke-width="1.6" cx="62" cy="94" r="3.6" />
      </g>
      <path v-if="p.accessory === 'scarf'" fill="#f59e0b" d="M38 74c4 6 20 6 24 0l3 6c-6 7-24 7-30 0z" />
      <!-- 脖子、脸、耳朵 -->
      <rect :fill="p.skin" x="44" y="62" width="12" height="14" rx="5" />
      <ellipse :fill="p.skin" cx="31" cy="48" rx="4" ry="5.5" />
      <ellipse :fill="p.skin" cx="69" cy="48" rx="4" ry="5.5" />
      <ellipse :fill="p.skin" cx="50" cy="46" rx="18" ry="21" />
      <!-- 前发 -->
      <path v-if="p.hair === 'short'" :fill="p.hairColor" d="M31 42c-1-16 9-24 19-24s21 7 19 24c-4-8-10-11-19-11s-15 3-19 11z" />
      <path v-else-if="p.hair === 'side'" :fill="p.hairColor" d="M31 44c-2-17 9-26 20-26 12 0 20 9 18 24-6-9-17-12-27-9-4 2-8 6-11 11z" />
      <path v-else-if="p.hair === 'bun'" :fill="p.hairColor" d="M32 43c0-15 8-22 18-22s18 7 18 22c-5-9-11-12-18-12s-13 3-18 12z" />
      <path v-else :fill="p.hairColor" d="M31 47c0-19 9-28 19-28s19 9 19 28c-3-10-9-15-14-16-3 5-12 9-24 16z" />
      <!-- 眼睛、腮红、嘴 -->
      <ellipse fill="#1f2937" cx="43" cy="48" rx="2.2" ry="2.8" />
      <ellipse fill="#1f2937" cx="57" cy="48" rx="2.2" ry="2.8" />
      <circle fill="#fff" cx="43.8" cy="47" r=".8" />
      <circle fill="#fff" cx="57.8" cy="47" r=".8" />
      <ellipse fill="#f472b6" opacity=".22" cx="38" cy="56" rx="4" ry="2.4" />
      <ellipse fill="#f472b6" opacity=".22" cx="62" cy="56" rx="4" ry="2.4" />
      <path fill="none" stroke="#9a3412" stroke-width="1.8" stroke-linecap="round" d="M45 58q5 4 10 0" />
      <!-- 眼镜 -->
      <g v-if="p.glasses === 'round'" fill="none" stroke="#1f2937" stroke-width="1.6">
        <circle cx="43" cy="48" r="6" /><circle cx="57" cy="48" r="6" /><path d="M49 48h2" />
      </g>
      <g v-else-if="p.glasses === 'rect'" fill="none" stroke="#1f2937" stroke-width="1.6">
        <rect x="36" y="43" width="13" height="10" rx="3" /><rect x="51" y="43" width="13" height="10" rx="3" /><path d="M49 48h2" />
      </g>
      <g v-else-if="p.glasses === 'sun'">
        <rect fill="#7c2d12" opacity=".85" x="35" y="43" width="14" height="10" rx="4" />
        <rect fill="#7c2d12" opacity=".85" x="51" y="43" width="14" height="10" rx="4" />
        <path stroke="#7c2d12" stroke-width="1.6" d="M49 47h2" />
      </g>
      <!-- 耳机 -->
      <g v-if="p.accessory === 'headset'" fill="none" stroke="#334155" stroke-width="3" stroke-linecap="round">
        <path d="M29 46c0-18 9-26 21-26s21 8 21 26" /><path d="M30 56c2 6 8 9 14 9" />
      </g>
    </svg>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import { personaFor } from '@/data/app-personas.js';

const props = defineProps({
  app: { type: Object, default: null },
  size: { type: Number, default: 64 },
});
const p = computed(() => personaFor(props.app));
</script>

<style scoped>
.app-avatar { display: inline-flex; flex-shrink: 0; border-radius: 50%; overflow: hidden; }
.app-avatar svg, .app-avatar img { width: 100%; height: 100%; object-fit: cover; }
</style>
