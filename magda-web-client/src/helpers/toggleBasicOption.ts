import { FacetOption } from "../helpers/datasetSearch";

export default function toggleBasicOption(
    option: FacetOption,
    activeOptions: Array<FacetOption>,
    key: string,
    removeOption: Function,
    addOption: Function,
    updateQuery: Function,
    dispatch: Function
) {
    updateQuery({
        page: undefined
    });

    const existingOptions = activeOptions.map((o) => o.value);
    const index = existingOptions.indexOf(option.value);
    if (index > -1) {
        updateQuery({
            [key]: [
                ...existingOptions.slice(0, index),
                ...existingOptions.slice(index + 1)
            ]
        });
        dispatch(removeOption(option));
    } else {
        updateQuery({
            [key]: [...existingOptions, option.value]
        });
        dispatch(addOption(option));
    }
}
