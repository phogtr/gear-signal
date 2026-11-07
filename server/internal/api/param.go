package api

func limitParam(limit *int, fallback int) (int, string) {
	if limit == nil {
		return fallback, ""
	}
	if *limit < 1 || *limit > 200 {
		return 0, "limit must be between 1 and 200"
	}
	return *limit, ""
}
