package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"ombus/internal/intake"
	"ombus/internal/server"
	"ombus/internal/store"
)

func main() {
	port := flag.Int("port", 8765, "local HTTP port")
	data := flag.String("data", "data/cases", "directory for case records")
	assets := flag.String("assets", "web/dist", "built frontend directory")
	flag.Parse()
	if _, err := os.Stat(filepath.Join(*assets, "index.html")); err != nil {
		log.Fatal("Build the TypeScript frontend with npm run build first.")
	}
	schema, err := intake.Load()
	if err != nil {
		log.Fatal(err)
	}
	cases, err := store.Open(*data)
	if err != nil {
		log.Fatal(err)
	}
	app := &http.Server{
		Addr: fmt.Sprintf("127.0.0.1:%d", *port), Handler: server.New(schema, cases, *assets),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		WriteTimeout: 15 * time.Second, IdleTimeout: 30 * time.Second,
	}
	log.Printf("Ombus is available at http://%s", app.Addr)
	log.Fatal(app.ListenAndServe())
}
