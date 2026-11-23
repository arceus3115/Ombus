package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"

	"ombus/internal/intake"
)

var ErrConflict = errors.New("this case ID is already used by a different intake")

type Files struct {
	dir string
}

func Open(dir string) (Files, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return Files{}, err
	}
	return Files{dir: dir}, nil
}

// Create publishes the complete file atomically. A retry with the same input returns the original record.
func (f Files) Create(record intake.Record) (intake.Record, bool, error) {
	if !intake.ValidID(record.ID) {
		return intake.Record{}, false, fmt.Errorf("invalid case ID")
	}
	temp, err := os.CreateTemp(f.dir, ".case-")
	if err != nil {
		return intake.Record{}, false, err
	}
	defer os.Remove(temp.Name())
	defer temp.Close()
	if err := json.NewEncoder(temp).Encode(record); err != nil {
		return intake.Record{}, false, err
	}
	if err := temp.Sync(); err != nil {
		return intake.Record{}, false, err
	}
	if err := temp.Close(); err != nil {
		return intake.Record{}, false, err
	}
	if err := os.Link(temp.Name(), f.filename(record.ID)); err != nil {
		if !errors.Is(err, os.ErrExist) {
			return intake.Record{}, false, err
		}
		existing, err := f.Get(record.ID)
		if err != nil {
			return intake.Record{}, false, err
		}
		if !reflect.DeepEqual(existing.Input, record.Input) {
			return intake.Record{}, false, ErrConflict
		}
		return existing, false, nil
	}
	return record, true, nil
}

func (f Files) filename(id string) string { return filepath.Join(f.dir, id+".json") }

func (f Files) Get(id string) (intake.Record, error) {
	if !intake.ValidID(id) {
		return intake.Record{}, os.ErrNotExist
	}
	data, err := os.ReadFile(f.filename(id))
	if err != nil {
		return intake.Record{}, err
	}
	var record intake.Record
	err = json.Unmarshal(data, &record)
	return record, err
}

func (f Files) List() ([]intake.Record, error) {
	entries, err := os.ReadDir(f.dir)
	if err != nil {
		return nil, err
	}
	var records []intake.Record
	for _, entry := range entries {
		id := strings.TrimSuffix(entry.Name(), ".json")
		if !strings.HasSuffix(entry.Name(), ".json") || !intake.ValidID(id) || !entry.Type().IsRegular() {
			continue
		}
		record, err := f.Get(id)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	slices.SortFunc(records, func(a, b intake.Record) int {
		if order := b.CreatedAt.Compare(a.CreatedAt); order != 0 {
			return order
		}
		return strings.Compare(a.ID, b.ID)
	})
	return records, nil
}
