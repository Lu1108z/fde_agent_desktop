<template>
  <div class="coach-page">
    <AgentHome :coach-mode="true" />
  </div>
</template>

<script setup>
import AgentHome from '@/pages/projects/AgentHome.vue';
</script>

<style scoped>
.coach-page { display:flex; flex:1; min-width:0; min-height:0; overflow:hidden; }
</style>
