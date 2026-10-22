import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import tsParser from '@typescript-eslint/parser'

/** Globales du navigateur et de Nuxt, utilisées par le front. */
const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  fetch: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FormData: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  IntersectionObserver: 'readonly',
  ResizeObserver: 'readonly',
  AbortController: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  console: 'readonly',
  process: 'readonly'
}

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/dist/**',
      '**/coverage/**'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        fetch: 'readonly',
        __dirname: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off'
    }
  },

  /**
   * Fichiers TypeScript du front. `no-undef` est coupé : les auto-imports de Nuxt
   * (ref, computed, useRuntimeConfig, defineNuxtPlugin…) ne sont pas déclarés dans
   * les sources, et c'est le compilateur TypeScript qui tranche sur les types.
   */
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: browserGlobals
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },

  /**
   * Composants Vue. C'est la partie qui manquait : sans ces règles, une erreur de
   * syntaxe dans un `<script setup>` ou un `<template>` passait inaperçue.
   */
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: ['.vue']
      },
      globals: browserGlobals
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Les pages Nuxt tirent leur nom du chemin du fichier.
      'vue/multi-word-component-names': 'off',
      // Le projet met plusieurs attributs par ligne quand c'est plus lisible.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off'
    }
  }
]
