<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  editable?: boolean
  minHeight?: string
}>(), {
  modelValue: '',
  placeholder: 'Escreva algo, ou pressione "/" para inserir blocos...',
  editable: true,
  minHeight: '8rem'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const content = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
})
</script>

<template>
  <EditorNotionStyleEditor
    v-model="content"
    :placeholder="placeholder"
    :editable="editable"
    :min-height="minHeight"
    surface="boxed"
  />
</template>
