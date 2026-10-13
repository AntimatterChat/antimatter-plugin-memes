// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

package main

import (
	"container/list"
	"sync"
)

// lru is a small cache keeping its last used entries.
type lru[V any] struct {
	mu      sync.Mutex
	size    int
	order   *list.List
	entries map[string]*list.Element
}

type lruEntry[V any] struct {
	key   string
	value V
}

func newLRU[V any](size int) *lru[V] {
	return &lru[V]{size: size, order: list.New(), entries: map[string]*list.Element{}}
}

func (c *lru[V]) get(key string) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e, ok := c.entries[key]; ok {
		c.order.MoveToFront(e)
		return e.Value.(*lruEntry[V]).value, true
	}
	var zero V
	return zero, false
}

func (c *lru[V]) put(key string, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e, ok := c.entries[key]; ok {
		e.Value.(*lruEntry[V]).value = value
		c.order.MoveToFront(e)
		return
	}
	c.entries[key] = c.order.PushFront(&lruEntry[V]{key, value})
	for c.order.Len() > c.size {
		last := c.order.Back()
		c.order.Remove(last)
		delete(c.entries, last.Value.(*lruEntry[V]).key)
	}
}

func (c *lru[V]) remove(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e, ok := c.entries[key]; ok {
		c.order.Remove(e)
		delete(c.entries, key)
	}
}
